import { localFontsSupported, localFontsGranted, enableLocalFonts, localFontsEnabled, provideFont } from "./fontsource.js";

const $ = s => document.querySelector(s);
const state = { ed: null, pages: [], spans: {}, zoom: 1.25, urls: {}, selected: null, editor: null, name: "", rendered: new Set() };
let Editor = null;

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 3200); }
function busy(on) { $("#busy").classList.toggle("on", on); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hex = c => "#" + c.toString(16).padStart(6, "0");
const showWs = s => s.replace(/ /g, "\u00b7");
const nextFrame = () => new Promise(r => setTimeout(r, 0));

// ------------------------------------------------------------ boot
(async () => {
  try {
    ({ Editor } = await import("./engine.js"));
    $("#dropMsg").innerHTML = 'Drop a PDF here, or click <b>Open PDF</b><br><button id="sampleBtn" style="margin-top:12px">Try a sample PDF</button>';
    $("#sampleBtn").onclick = async () => { const b = await (await fetch("samples/invoice.pdf")).arrayBuffer(); openFile(new File([b], "sample-invoice.pdf", { type: "application/pdf" })); };
    $("#openBtn").disabled = false;
    if (await localFontsGranted()) await enableLocalFonts();
  } catch (e) {
    $("#dropMsg").textContent = "Could not load the PDF engine: " + e.message + ". Try a recent Chrome, Edge, Safari or Firefox.";
  }
})();

// ------------------------------------------------------------ open / render
async function openFile(f) {
  if (!f || !Editor) return;
  busy(true); await nextFrame();
  try {
    let ed;
    try { ed = new Editor(await f.arrayBuffer(), f.name, { fontProvider: provideFont }); }
    catch (e) { throw new Error(/password/i.test(e.message) ? e.message : "this file doesn't look like a valid PDF"); }
    state.ed?.close(); state.ed = ed;
    Object.values(state.urls).forEach(u => URL.revokeObjectURL(u));
    Object.assign(state, { name: f.name, pages: ed.pageSizes, spans: {}, urls: {}, selected: null, editor: null, rendered: new Set() });
    $("#fname").textContent = f.name; $("#drop").style.display = "none";
    ["#zoom", "#dlBtn", "#find"].forEach(s => $(s).disabled = false);
    $("#undoBtn").disabled = true;
    buildPages(); state.pages.forEach((_, i) => loadSpans(i));
    renderSide();
  } catch (e) { toast("Could not open: " + e.message); }
  busy(false);
}

const io = new IntersectionObserver(entries => {
  for (const en of entries) if (en.isIntersecting) { const i = +en.target.dataset.page; if (!state.rendered.has(i)) renderImg(i); }
}, { root: $("#viewer"), rootMargin: "600px" });

function buildPages() {
  const wrap = $("#pages"); wrap.innerHTML = ""; state.rendered = new Set(); io.disconnect();
  state.pages.forEach(([w, h], i) => {
    const d = document.createElement("div"); d.className = "page"; d.id = "page" + i; d.dataset.page = i;
    d.style.width = w * state.zoom + "px"; d.style.height = h * state.zoom + "px";
    d.innerHTML = `<span class="pno">Page ${i + 1}</span><img alt="">`;
    wrap.appendChild(d); io.observe(d);
  });
}
function renderImg(i) {
  state.rendered.add(i);
  const [w, h] = state.pages[i];
  const z = Math.min(state.zoom * Math.max(window.devicePixelRatio || 1, 1.5), 4000 / Math.max(w, h)); // cap ~4000px
  const png = state.ed.render(i, z);
  if (state.urls[i]) URL.revokeObjectURL(state.urls[i]);
  state.urls[i] = URL.createObjectURL(new Blob([png], { type: "image/png" }));
  $(`#page${i} img`).src = state.urls[i];
}
function loadSpans(i) {
  const pg = $("#page" + i); pg.querySelectorAll(".span").forEach(e => e.remove());
  for (const s of state.ed.spanList(i)) {
    state.spans[s.id] = s;
    const [x0, y0, x1, y1] = s.bbox, z = state.zoom, e = document.createElement("div");
    e.className = "span" + (s.edited != null ? (s.warning ? " warn" : " edited") : "") + (state.selected === s.id ? " sel" : "");
    e.dataset.id = s.id;
    Object.assign(e.style, { left: x0 * z + "px", top: y0 * z + "px", width: (x1 - x0) * z + "px", height: (y1 - y0) * z + "px" });
    e.title = s.edited ?? s.text;
    e.onclick = ev => { ev.stopPropagation(); startEdit(s.id); };
    pg.appendChild(e);
  }
  applyFind();
}

// ------------------------------------------------------------ editing
function cssFont(s) {
  const n = s.font.toLowerCase();
  const fam = /courier|mono|menlo|consol|code/.test(n) || (s.flags & 8) ? "ui-monospace, Menlo, monospace"
            : (/times|georgia|garamond|serif|roman|cambria|minion/.test(n) && !/sans/.test(n)) ? "Georgia, 'Times New Roman', serif"
            : "-apple-system, Helvetica, Arial, sans-serif";
  return { fam, bold: (s.flags & 16) || /bold|black|heavy/.test(n), ital: (s.flags & 2) || /italic|oblique/.test(n) };
}

async function startEdit(id) {
  if (state.editor && state.editor.id === id) return;
  await closeEditor(true);
  const s = state.spans[id]; if (!s) return;
  state.selected = id;
  document.querySelectorAll(".span.sel").forEach(e => e.classList.remove("sel"));
  const el = document.querySelector(`.span[data-id="${CSS.escape(id)}"]`); if (!el) return;
  el.classList.add("sel");
  const [x0, y0, x1, y1] = s.bbox, z = state.zoom, f = cssFont(s);
  const inp = document.createElement("input");
  inp.className = "editbox"; inp.value = s.edited ?? s.text; inp.spellcheck = false;
  Object.assign(inp.style, { left: (x0 * z - 4) + "px", top: (y0 * z - 3) + "px", height: ((y1 - y0) * z + 6) + "px",
    fontSize: s.size * z + "px", fontFamily: f.fam, fontWeight: f.bold ? 700 : 400, fontStyle: f.ital ? "italic" : "normal",
    minWidth: Math.max((x1 - x0) * z + 12, 60) + "px" });
  const grow = () => { inp.style.width = "0px"; inp.style.width = (inp.scrollWidth + 8) + "px"; };
  inp.oninput = () => { grow(); scheduleCheck(); };
  inp.onkeydown = ev => {
    if (ev.key === "Enter") { ev.preventDefault(); closeEditor(true); }
    else if (ev.key === "Escape") { ev.preventDefault(); closeEditor(false); renderSide(); }
    else if (ev.key === "Tab") { ev.preventDefault(); const nx = neighbour(id, ev.shiftKey ? -1 : 1); closeEditor(true).then(() => nx && startEdit(nx)); }
  };
  inp.onblur = () => setTimeout(() => { if (state.editor && state.editor.inp === inp) closeEditor(true); }, 150);
  el.parentElement.appendChild(inp); state.editor = { id, inp };
  grow(); inp.focus(); inp.select();
  renderSide(); scheduleCheck();
}
function neighbour(id, dir) {
  const key = k => k.split(":").map(Number);
  const ids = Object.keys(state.spans).sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  return ids[ids.indexOf(id) + dir] || null;
}
let checkTimer;
function scheduleCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(async () => { const ed = state.editor; if (!ed) return; renderCheck(await state.ed.check(ed.id, ed.inp.value)); }, 180);
}
function renderCheck(r) {
  const box = $("#liveCheck"); if (!box) return;
  if (!r.native) box.innerHTML = `<div class="note warn">This PDF's font can't be reused for new text, so it will be drawn with <b>${esc(r.fallback)}</b>.</div>`;
  else if (r.missing.length) box.innerHTML = `<div class="note warn">Not in the PDF's embedded font: <b>${esc(r.missing.join(" "))}</b><br>Those characters will use <b>${esc(r.fallback)}</b>. Everything else keeps the original font.</div>`;
  else box.innerHTML = `<div class="note ok">All characters are available in the original embedded font. The result will match exactly.</div>`;
  renderFontPanel(r);
}
function renderFontPanel(r) {
  const p = $("#fontPanel");
  const needs = r && (r.missing.length || !r.native) && !r.installed;
  if (!needs) { p.innerHTML = ""; return; }
  if (localFontsSupported() && !localFontsEnabled())
    p.innerHTML = `<div class="fontbar">For a closer match, let this page use the fonts installed on your computer.<br>
      <button id="lfBtn">Use my installed fonts</button></div>`;
  else if (!localFontsSupported())
    p.innerHTML = `<div class="fontbar">Tip: open this page in Chrome or Edge to draw missing letters with the exact font installed on your computer.</div>`;
  else p.innerHTML = `<div class="fontbar">This font is not installed on your computer, so the closest built-in font is used.</div>`;
  const b = $("#lfBtn");
  if (b) b.onclick = async () => {
    if (await enableLocalFonts()) { state.ed.clearFallbacks(); toast("Installed fonts enabled."); await doEdit(() => state.ed.rebuild(), null, true); scheduleCheck(); }
    else toast("Font access was not granted.");
  };
}

async function closeEditor(apply) {
  const ed = state.editor; if (!ed) return;
  state.editor = null; ed.inp.remove();
  const s = state.spans[ed.id], cur = s.edited ?? s.text;
  if (!apply || ed.inp.value === cur) return;
  await doEdit(() => state.ed.setEdit(ed.id, ed.inp.value), ed.id);
}
async function doEdit(fn, id, allPages = false) {
  busy(true); await nextFrame();
  try {
    const page = await fn();
    $("#undoBtn").disabled = !state.ed.canUndo();
    const pages = allPages ? state.pages.map((_, i) => i) : page != null ? [page] : [];
    for (const p of pages) { if (state.rendered.has(p) || !allPages) renderImg(p); loadSpans(p); }
    renderSide();
    const w = id && state.ed.warnings.get(id); if (w) toast(w);
  } catch (e) { console.error(e); toast("Edit failed: " + e.message); }
  busy(false);
}

// ------------------------------------------------------------ side panel
function renderSide() {
  const s = state.spans[state.selected];
  if (s) {
    $("#selInfo").innerHTML = `<div class="kv">
      <b>Original</b><span style="word-break:break-word">${esc(showWs(s.text))}</span>
      ${s.edited != null ? `<b>Now</b><span style="word-break:break-word">${esc(showWs(s.edited))}</span>` : ""}
      <b>Font</b><span>${esc(s.font.split("+").pop())}</span>
      <b>Size</b><span>${s.size.toFixed(2)} pt</span>
      <b>Color</b><span><i class="sw" style="background:${hex(s.color)}"></i>${hex(s.color)}</span>
      <b>Page</b><span>${s.page + 1}</span></div>
      ${s.native === "ok" ? "" : `<div class="note warn">Original font can't be reused: ${esc(s.native)}</div>`}
      <div id="liveCheck"></div>
      ${s.warning ? `<div class="note warn">${esc(s.warning)}</div>` : ""}
      ${s.edited != null ? `<button id="revSel" style="margin-top:8px">Revert to original</button>` : ""}`;
    const rb = $("#revSel"); if (rb) rb.onclick = () => doEdit(() => state.ed.revert(s.id), s.id);
  }
  const edited = Object.values(state.spans).filter(x => x.edited != null);
  $("#editCount").textContent = edited.length ? `(${edited.length})` : "";
  $("#edits").innerHTML = edited.length ? edited.map(x => `
    <div class="edit-item" data-id="${esc(x.id)}">
      <div class="old">${esc(x.text)}</div><div class="new">${esc(x.edited) || '<i class="muted">(removed)</i>'}</div>
      ${x.warning ? `<div class="note warn" style="margin-top:6px">${esc(x.warning)}</div>` : ""}
      <div class="row"><span class="muted">Page ${x.page + 1}</span><button data-revert="${esc(x.id)}">Revert</button></div>
    </div>`).join("") : '<span class="muted">No edits yet.</span>';
  $("#edits").querySelectorAll(".edit-item").forEach(el => el.onclick = ev => {
    const rid = ev.target.dataset.revert;
    if (rid) { ev.stopPropagation(); return doEdit(() => state.ed.revert(rid), rid); }
    document.querySelector(`.span[data-id="${CSS.escape(el.dataset.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    startEdit(el.dataset.id);
  });
}

function applyFind() {
  const q = $("#find").value.trim().toLowerCase(); let first = null;
  document.querySelectorAll(".span").forEach(e => {
    const s = state.spans[e.dataset.id]; const hit = q && (s.edited ?? s.text).toLowerCase().includes(q);
    e.classList.toggle("match", !!hit); if (hit && !first) first = e;
  });
  return first;
}

// ------------------------------------------------------------ wiring
$("#find").addEventListener("keydown", e => { if (e.key === "Enter") applyFind()?.scrollIntoView({ block: "center", behavior: "smooth" }); });
$("#find").addEventListener("input", applyFind);
$("#openBtn").onclick = () => $("#file").click();
$("#file").onchange = e => { openFile(e.target.files[0]); e.target.value = ""; };
$("#showBoxes").onchange = e => $("#pages").classList.toggle("show", e.target.checked);
$("#zoom").onchange = async e => { await closeEditor(true); state.zoom = +e.target.value; buildPages(); state.pages.forEach((_, i) => loadSpans(i)); };
$("#undoBtn").onclick = () => doEdit(() => state.ed.undo(), null);
$("#dlBtn").onclick = async () => {
  await closeEditor(true); busy(true); await nextFrame();
  try {
    const blob = new Blob([state.ed.save()], { type: "application/pdf" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = state.name.replace(/\.pdf$/i, "") + "_edited.pdf"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { toast("Save failed: " + e.message); }
  busy(false);
};
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !state.editor && !$("#undoBtn").disabled
      && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); doEdit(() => state.ed.undo(), null); }
});
window.addEventListener("beforeunload", e => { if (state.ed && state.ed.edits.size) { e.preventDefault(); e.returnValue = ""; } });
const v = $("#viewer");
v.addEventListener("dragover", e => { e.preventDefault(); $("#drop").classList.add("over"); });
v.addEventListener("dragleave", () => $("#drop").classList.remove("over"));
v.addEventListener("drop", e => { e.preventDefault(); $("#drop").classList.remove("over"); openFile(e.dataTransfer.files[0]); });
v.addEventListener("click", e => { if (e.target === v || e.target.id === "pages") closeEditor(true); });

// Footer source link: user.github.io/repo -> github.com/user/repo (AGPL source offer)
(() => {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname), a = $("#srcLink");
  if (m) a.href = `https://github.com/${m[1]}/${location.pathname.split("/").filter(Boolean)[0] || m[1] + ".github.io"}`;
  else a.style.display = "none";
})();
