// PDF text-replacement engine (browser + node), port of the local engine.py.
// Strategy: remove the original glyphs with a true text redaction (no fill box),
// then write the new text with the PDF's ORIGINAL embedded font object, encoded
// through its ToUnicode / Encoding tables. Characters missing from the subset are
// drawn with a fallback font (an installed copy of the same font when the app can
// supply one, else the closest built-in font) and reported as warnings.
import * as mupdf from "./lib/mupdf.js";
export { mupdf };

// ---------------------------------------------------------------- small helpers
const latin1 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
const nameOf = o => (o && !o.isNull() && o.isName()) ? o.asName().replace(/^\//, "") : "";
const numOf = (o, d = 0) => (o && !o.isNull() && o.isNumber()) ? o.asNumber() : d;
const xform = (p, m) => [p[0] * m[0] + p[1] * m[2] + m[4], p[0] * m[1] + p[1] * m[3] + m[5]];
const norm = s => String(s).split("+").pop().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(psmt|mt|ps)$/, "");
const fmt = n => (Math.abs(n) < 1e-9 ? 0 : n).toFixed(4).replace(/\.?0+$/, "") || "0";

function hex2u(h) {
  if (!h) return "";
  if (h.length % 2) h = "0" + h;
  if ((h.length / 2) % 2) h = "00" + h;
  let s = "";
  for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  return s;
}

function parseToUnicode(s) {
  const m = new Map(); let nbytes = 0;
  const cs = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(s); if (cs) nbytes = cs[1].length / 2;
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, a, b] of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) { m.set(parseInt(a, 16), hex2u(b)); nbytes ||= a.length / 2; }
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, a, b, rest] of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]*>)/g)) {
      const lo = parseInt(a, 16), hi = parseInt(b, 16); nbytes ||= a.length / 2;
      if (hi - lo > 20000) continue;
      if (rest[0] === "[") { let k = 0; for (const [, d] of rest.matchAll(/<([0-9A-Fa-f]*)>/g)) m.set(lo + k++, hex2u(d)); }
      else { const base = hex2u(rest.slice(1, -1)); if (!base) continue;
        for (let k = 0; k <= hi - lo; k++) m.set(lo + k, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + k)); }
    }
  return { m, nbytes: nbytes || 1 };
}

// Common Adobe glyph names (enough for /Differences in Latin documents).
const AGL = { space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&", quotesingle: "'",
  parenleft: "(", parenright: ")", asterisk: "*", plus: "+", comma: ",", hyphen: "-", period: ".", slash: "/", zero: "0", one: "1",
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", colon: ":", semicolon: ";", less: "<",
  equal: "=", greater: ">", question: "?", at: "@", bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^",
  underscore: "_", grave: "`", braceleft: "{", bar: "|", braceright: "}", asciitilde: "~", quoteleft: "\u2018", quoteright: "\u2019",
  quotedblleft: "\u201c", quotedblright: "\u201d", endash: "\u2013", emdash: "\u2014", bullet: "\u2022", ellipsis: "\u2026",
  Euro: "\u20ac", sterling: "\u00a3", yen: "\u00a5", cent: "\u00a2", copyright: "\u00a9", registered: "\u00ae", trademark: "\u2122",
  degree: "\u00b0", section: "\u00a7", paragraph: "\u00b6", periodcentered: "\u00b7", minus: "\u2212", multiply: "\u00d7",
  divide: "\u00f7", fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl", nbspace: "\u00a0", hyphenminus: "-", rupee: "\u20b9",
  eacute: "é", egrave: "è", ecircumflex: "ê", edieresis: "ë", aacute: "á", agrave: "à", acircumflex: "â", adieresis: "ä",
  atilde: "ã", aring: "å", ccedilla: "ç", iacute: "í", igrave: "ì", icircumflex: "î", idieresis: "ï", ntilde: "ñ", oacute: "ó",
  ograve: "ò", ocircumflex: "ô", odieresis: "ö", otilde: "õ", oslash: "ø", uacute: "ú", ugrave: "ù", ucircumflex: "û",
  udieresis: "ü", yacute: "ý", ydieresis: "ÿ", germandbls: "ß", Eacute: "É", Aacute: "Á", Adieresis: "Ä", Odieresis: "Ö",
  Udieresis: "Ü", Ccedilla: "Ç", Ntilde: "Ñ" };
function glyphToUnicode(n) {
  if (AGL[n]) return AGL[n];
  if (/^[A-Za-z]$/.test(n)) return n;
  let m = /^uni([0-9A-Fa-f]{4,})$/.exec(n); if (m) return hex2u(m[1]);
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(n); if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return "";
}
const WIN = "\u20ac\ufffd\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\ufffd\u017d\ufffd\ufffd\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\ufffd\u017e\u0178";
const decodeSimple = (c, base) => (base === "WinAnsiEncoding" && c >= 128 && c < 160) ? WIN[c - 128] : String.fromCharCode(c);

const BUILTIN = {
  he: ["Helvetica", "Helvetica-Oblique", "Helvetica-Bold", "Helvetica-BoldOblique"],
  ti: ["Times-Roman", "Times-Italic", "Times-Bold", "Times-BoldItalic"],
  co: ["Courier", "Courier-Oblique", "Courier-Bold", "Courier-BoldOblique"] };
const SANS = /helvetica|arial|sans|avenir|verdana|tahoma|calibri|segoe|roboto|inter|futura|gill|lato|open|trebuchet|frutiger|myriad|neue/;
function builtinFor(ps, flags) {
  const low = ps.toLowerCase();
  const bold = (flags & 16) || /bold|black|heavy|semibold/.test(low), ital = (flags & 2) || /italic|oblique/.test(low);
  const fam = (flags & 8) || /courier|mono|menlo|monaco|consol|code|typewriter/.test(low) ? "co" : SANS.test(low) ? "he"
            : (flags & 4) || /times|serif|georgia|garamond|roman/.test(low) ? "ti" : "he";
  return BUILTIN[fam][(bold ? 2 : 0) + (ital ? 1 : 0)];
}

// ---------------------------------------------------------------- font model
class PdfFont {
  constructor(dict, num) {
    this.num = num; this.usable = false; this.reason = ""; this.codeBytes = 1;
    this.u2code = new Map(); this.maxKey = 1; this.wExp = new Map(); this.wRanges = []; this.dw = 1000; this.embedded = false;
    this.basefont = nameOf(dict.get("BaseFont")); this.subtype = nameOf(dict.get("Subtype"));
    try { this._load(dict); } catch (e) { this.usable = false; this.reason = "font parse error: " + e.message; }
  }
  static embeddedIn(fd) { return !!fd && !fd.isNull() && ["FontFile", "FontFile2", "FontFile3"].some(k => !fd.get(k).isNull()); }
  _load(dict) {
    let code2u = new Map();
    const tu = dict.get("ToUnicode");
    if (!tu.isNull() && tu.isStream()) { const r = parseToUnicode(latin1(tu.readStream().asUint8Array())); code2u = r.m; this.codeBytes = r.nbytes; }
    if (this.subtype === "Type0") {
      const enc = nameOf(dict.get("Encoding"));
      if (enc !== "Identity-H") { this.reason = `unsupported CID encoding ${enc || "(embedded CMap)"}`; return; }
      this.codeBytes = 2;
      const desc = dict.get("DescendantFonts").get(0);
      if (desc.isNull()) { this.reason = "no descendant font"; return; }
      this.embedded = PdfFont.embeddedIn(desc.get("FontDescriptor"));
      this.dw = numOf(desc.get("DW"), 1000);
      const W = desc.get("W");
      if (W.isArray()) for (let i = 0; i < W.length;) {
        const c = W.get(i).asNumber(); const nx = W.get(i + 1);
        if (nx.isArray()) { for (let k = 0; k < nx.length; k++) this.wExp.set(c + k, nx.get(k).asNumber()); i += 2; }
        else { this.wRanges.push([c, nx.asNumber(), W.get(i + 2).asNumber()]); i += 3; }
      }
      if (!code2u.size) { this.reason = "no ToUnicode map"; return; }
    } else if (["TrueType", "Type1", "MMType1"].includes(this.subtype)) {
      this.embedded = PdfFont.embeddedIn(dict.get("FontDescriptor"));
      const first = numOf(dict.get("FirstChar"), 0), W = dict.get("Widths");
      if (W.isArray()) for (let i = 0; i < W.length; i++) this.wExp.set(first + i, W.get(i).asNumber());
      if (!code2u.size) code2u = this._simpleEncoding(dict);
      if (!this.wExp.size) this._builtinWidths(code2u);
    } else { this.reason = `${this.subtype} fonts are not re-encodable`; return; }
    for (const code of [...code2u.keys()].sort((a, b) => a - b)) {
      const u = code2u.get(code);
      if (!u || (u.length === 1 && u.charCodeAt(0) < 32)) continue;
      if (this.subtype !== "Type0" && this.embedded && this.wExp.size && !(this.wExp.get(code) > 0)) continue;
      if (!this.u2code.has(u)) this.u2code.set(u, code);
    }
    this.maxKey = Math.max(1, ...[...this.u2code.keys()].map(k => k.length));
    this.usable = this.u2code.size > 0;
    if (!this.usable) this.reason = "font has no usable character map";
  }
  _simpleEncoding(dict) {
    const enc = dict.get("Encoding"); let base = "StandardEncoding", diffs = null;
    if (enc.isName()) base = nameOf(enc);
    else if (enc.isDictionary()) { base = nameOf(enc.get("BaseEncoding")) || base; diffs = enc.get("Differences"); }
    const m = new Map();
    for (let c = 32; c < 256; c++) { const u = decodeSimple(c, base); if (u !== "\ufffd") m.set(c, u); }
    if (diffs && diffs.isArray()) { let code = 0;
      for (let i = 0; i < diffs.length; i++) { const it = diffs.get(i);
        if (it.isNumber()) code = it.asNumber(); else { const u = glyphToUnicode(nameOf(it)); if (u) m.set(code, u); code++; } } }
    return m;
  }
  _builtinWidths(code2u) {
    const f = new mupdf.Font(builtinFor(this.basefont, 0));
    for (const [c, u] of code2u) if (u.length === 1) { const g = f.encodeCharacter(u.codePointAt(0)); this.wExp.set(c, f.advanceGlyph(g) * 1000); }
    f.destroy?.();
  }
  width(code) {
    if (this.wExp.has(code)) return this.wExp.get(code);
    for (const [a, b, w] of this.wRanges) if (code >= a && code <= b) return w;
    return this.subtype === "Type0" ? this.dw : 0;
  }
  // -> [{ok, codes, text}]
  encodeRuns(text) {
    const runs = []; let i = 0;
    while (i < text.length) {
      let piece = null, code;
      for (let L = Math.min(this.maxKey, text.length - i); L > 0; L--) { const p = text.substr(i, L); if (this.u2code.has(p)) { piece = p; code = this.u2code.get(p); break; } }
      const ok = piece !== null; if (!ok) piece = String.fromCodePoint(text.codePointAt(i));
      const last = runs[runs.length - 1], ws = !piece.trim();
      if (last && last.ok === ok && (ok || !last.text.trim() === ws)) { last.text += piece; if (ok) last.codes.push(code); }
      else runs.push({ ok, codes: ok ? [code] : null, text: piece });
      i += piece.length;
    }
    return runs;
  }
  hex(codes) { return "<" + codes.map(c => c.toString(16).toUpperCase().padStart(this.codeBytes * 2, "0")).join("") + ">"; }
}

// ---------------------------------------------------------------- page scanning
function pageFontObjects(pageObj) {
  const out = [], seen = new Set();
  const visit = res => {
    if (!res || res.isNull()) return;
    const fonts = res.get("Font");
    if (fonts.isDictionary()) fonts.forEach(v => { if (v.isIndirect()) { const n = v.asIndirect(); if (!seen.has(n)) { seen.add(n); out.push({ num: n, dict: v.resolve() }); } } });
    const xo = res.get("XObject");
    if (xo.isDictionary()) xo.forEach(v => { const r = v.resolve(); if (nameOf(r.get("Subtype")) === "Form") { const k = "x" + (v.isIndirect() ? v.asIndirect() : Math.random()); if (!seen.has(k)) { seen.add(k); visit(r.get("Resources")); } } });
  };
  visit(pageObj.getInheritable("Resources"));
  return out;
}

function colorInt(c) {
  if (!c || !c.length) return 0;
  let r, g, b;
  if (c.length === 1) r = g = b = c[0];
  else if (c.length === 3) [r, g, b] = c;
  else { const k = c[3]; r = (1 - c[0]) * (1 - k); g = (1 - c[1]) * (1 - k); b = (1 - c[2]) * (1 - k); }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

function scanSpans(page, pno) {
  const st = page.toStructuredText("preserve-whitespace,preserve-ligatures");
  const spans = []; let bi = -1, li = -1, line = null, cur = null;
  st.walk({
    beginTextBlock() { bi++; li = -1; },
    beginLine(bbox, wmode, dir) { li++; line = { dir: [dir[0], dir[1]], n: -1 }; cur = null; },
    onChar(c, origin, font, size, quad, color) {
      const col = colorInt(color), fname = font.getName();
      if (!cur || cur.font !== fname || Math.abs(cur.size - size) > 0.01 || cur.color !== col) {
        line.n++;
        let flags = 0;
        try { if (font.isItalic()) flags |= 2; if (font.isSerif()) flags |= 4; if (font.isMono()) flags |= 8; if (font.isBold()) flags |= 16; } catch (e) {}
        cur = { id: `${pno}:${bi}:${li}:${line.n}`, page: pno, font: fname, size, color: col, flags, dir: line.dir,
                origin: [origin[0], origin[1]], chars: [], text: "" };
        spans.push(cur);
      }
      const xs = [quad[0], quad[2], quad[4], quad[6]], ys = [quad[1], quad[3], quad[5], quad[7]];
      cur.chars.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      cur.text += c;
    },
    endLine() { cur = null; },
  });
  st.destroy?.();
  return spans.filter(s => s.text.trim()).map(s => {
    const b = s.chars.reduce((a, r) => [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3])], [1e9, 1e9, -1e9, -1e9]);
    return { ...s, bbox: b };
  });
}

// ---------------------------------------------------------------- editor
export class Editor {
  // fontProvider: async (postscriptName) => Uint8Array | {data, index} | null   (optional)
  constructor(bytes, name = "document.pdf", { fontProvider = null } = {}) {
    this.name = name; this.original = new Uint8Array(bytes); this.fontProvider = fontProvider;
    const doc = mupdf.Document.openDocument(this.original, "application/pdf");
    if (doc.needsPassword()) { doc.destroy?.(); throw new Error("Password-protected PDFs are not supported"); }
    if (!doc.isPDF()) { doc.destroy?.(); throw new Error("Not a PDF file"); }
    this.pageCount = doc.countPages();
    this.pageSizes = []; this.spans = new Map(); this.pageSpans = []; this.fonts = new Map(); this.pageFonts = [];
    for (let i = 0; i < this.pageCount; i++) {
      const p = doc.loadPage(i), b = p.getBounds();
      this.pageSizes.push([b[2] - b[0], b[3] - b[1]]);
      const fl = pageFontObjects(p.getObject());
      for (const f of fl) if (!this.fonts.has(f.num)) this.fonts.set(f.num, new PdfFont(f.dict, f.num));
      this.pageFonts.push(fl.map(f => f.num));
      const sp = scanSpans(p, i);
      for (const s of sp) { s.fontNum = this._matchFont(s); this.spans.set(s.id, s); }
      this.pageSpans.push(sp.map(s => s.id));
      p.destroy?.();
    }
    this.doc = doc; this.edits = new Map(); this.history = []; this.warnings = new Map();
    this.fallbackCache = new Map(); this._queue = Promise.resolve();
  }

  _matchFont(s) {
    const want = norm(s.font), nums = this.pageFonts[s.page];
    let cands = nums.filter(n => norm(this.fonts.get(n).basefont) === want);
    if (!cands.length) cands = nums.filter(n => want && norm(this.fonts.get(n).basefont).includes(want));
    let best = 0, bestCov = -1;
    for (const n of cands) {
      const f = this.fonts.get(n);
      const cov = f.usable ? f.encodeRuns(s.text).filter(r => r.ok).reduce((a, r) => a + r.text.length, 0) : 0;
      if (cov > bestCov) { best = n; bestCov = cov; }
    }
    return best;
  }

  fontStatus(s) {
    if (!s.fontNum) return "font not found in page resources";
    const f = this.fonts.get(s.fontNum); return f.usable ? "ok" : f.reason;
  }

  spanList(pno) {
    return this.pageSpans[pno].map(id => { const s = this.spans.get(id);
      return { id, page: s.page, text: s.text, font: s.font, size: s.size, flags: s.flags, color: s.color, bbox: s.bbox,
               origin: s.origin, dir: s.dir, edited: this.edits.has(id) ? this.edits.get(id) : null,
               warning: this.warnings.get(id) || null, native: this.fontStatus(s) }; });
  }

  missingChars(id, text) {
    const s = this.spans.get(id), f = s.fontNum ? this.fonts.get(s.fontNum) : null;
    if (!f || !f.usable) return { native: false, missing: [...new Set(text.replace(/\s/g, ""))].sort() };
    const miss = new Set(); for (const r of f.encodeRuns(text)) if (!r.ok) for (const ch of r.text) if (ch.trim()) miss.add(ch);
    return { native: true, missing: [...miss].sort() };
  }

  psName(s) { return s.font.split("+").pop(); }

  async _fallback(s) {
    const ps = this.psName(s), key = ps + "|" + s.flags;
    if (this.fallbackCache.has(key)) return this.fallbackCache.get(key);
    let res = null;
    if (this.fontProvider) {
      try { const got = await this.fontProvider(ps);
        if (got) { const data = got.data || got, idx = got.index || 0; res = { font: new mupdf.Font(ps, data, idx), label: `installed ${ps}`, installed: true }; } }
      catch (e) { res = null; }
    }
    if (!res) { const b = builtinFor(ps, s.flags); res = { font: new mupdf.Font(b), label: `closest built-in font (${b})`, installed: false }; }
    this.fallbackCache.set(key, res);
    return res;
  }

  async check(id, text) {
    const r = this.missingChars(id, text);
    if (!r.missing.length && r.native) return { ...r, fallback: null };
    const fb = await this._fallback(this.spans.get(id));
    return { ...r, fallback: fb.label, installed: fb.installed };
  }

  // All mutations run strictly one after another, and a failed rebuild rolls back.
  _serial(fn) { const run = this._queue.then(fn, fn); this._queue = run.catch(() => {}); return run; }
  async _mutate(change) {
    const edits = new Map(this.edits), history = this.history.slice();
    const page = change();
    if (page === null) return null;
    try { await this._rebuild(); return page; }
    catch (e) { this.edits = edits; this.history = history; throw e; }
  }
  setEdit(id, text) {
    return this._serial(() => this._mutate(() => {
      if (!this.spans.has(id)) throw new Error("unknown text " + id);
      this.history.push([id, this.edits.has(id) ? this.edits.get(id) : null]);
      if (text === this.spans.get(id).text) this.edits.delete(id); else this.edits.set(id, text);
      return this.spans.get(id).page;
    }));
  }
  revert(id) {
    return this._serial(() => this._mutate(() => {
      this.history.push([id, this.edits.get(id) ?? null]); this.edits.delete(id); return this.spans.get(id).page;
    }));
  }
  undo() {
    return this._serial(() => this._mutate(() => {
      const h = this.history.pop(); if (!h) return null;
      const [id, prev] = h; if (prev === null) this.edits.delete(id); else this.edits.set(id, prev);
      return this.spans.get(id).page;
    }));
  }
  rebuild() { return this._serial(() => this._rebuild()); }
  canUndo() { return this.history.length > 0; }
  clearFallbacks() { for (const f of this.fallbackCache.values()) f.font.destroy?.(); this.fallbackCache.clear(); }

  async _rebuild() {
    const byPage = new Map();
    for (const [id, t] of this.edits) { const s = this.spans.get(id); if (!byPage.has(s.page)) byPage.set(s.page, []); byPage.get(s.page).push([s, t]); }
    // resolve fallback fonts first (may be async)
    const fbs = new Map();
    for (const items of byPage.values()) for (const [s, t] of items) {
      const r = this.missingChars(s.id, t); if (!r.native || r.missing.length) fbs.set(s.id, await this._fallback(s));
    }
    const doc = mupdf.Document.openDocument(this.original, "application/pdf");
    this.warnings = new Map();
    for (const [pno, items] of byPage) this._applyPage(doc, pno, items, fbs);
    this.doc.destroy?.(); this.doc = doc;
  }

  _applyPage(doc, pno, items, fbs) {
    let page = doc.loadPage(pno);
    for (const [s] of items) for (const [x0, y0, x1, y1] of s.chars) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max((x1 - x0) * 0.15, 0.2), h = Math.max((y1 - y0) * 0.15, 0.2);
      const a = page.createAnnotation("Redact"); a.setRect([cx - w, cy - h, cx + w, cy + h]);
    }
    page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE);
    const ctm = page.getTransform(), inv = mupdf.Matrix.invert(ctm);
    const pobj = page.getObject();
    let res = pobj.get("Resources");
    if (res.isNull()) { res = pobj.getInheritable("Resources"); res = res.isNull() ? doc.newDictionary() : doc.addObject(res.resolve()); pobj.put("Resources", res); }
    res = res.resolve();
    let fdict = res.get("Font"); if (fdict.isNull()) { res.put("Font", doc.newDictionary()); fdict = res.get("Font"); }
    fdict = fdict.resolve();
    const ops = [], fbRefs = new Map();
    for (const [s, text] of items) {
      if (!text) continue;
      const f = s.fontNum ? this.fonts.get(s.fontNum) : null, native = !!(f && f.usable);
      const runs = native ? f.encodeRuns(text) : [{ ok: false, codes: null, text }];
      const size = s.size, rgb = [(s.color >> 16) & 255, (s.color >> 8) & 255, s.color & 255].map(v => fmt(v / 255)).join(" ");
      let pos = s.origin.slice(); const dir = s.dir; const missing = new Set();
      const fb = fbs.get(s.id);
      const tm = p => { const a = xform(p, inv), b = xform([p[0] + dir[0], p[1] + dir[1]], inv);
        let dx = b[0] - a[0], dy = b[1] - a[1]; const ln = Math.hypot(dx, dy) || 1; dx /= ln; dy /= ln;
        return `${fmt(dx)} ${fmt(dy)} ${fmt(-dy)} ${fmt(dx)} ${fmt(a[0])} ${fmt(a[1])} Tm`; };
      for (const r of runs) {
        let adv;
        if (r.ok) {
          const alias = "AkiF" + f.num; fdict.put(alias, doc.newIndirect(f.num));
          ops.push(`BT /${alias} ${fmt(size)} Tf ${rgb} rg ${tm(pos)} ${f.hex(r.codes)} Tj ET`);
          adv = r.codes.reduce((a, c) => a + f.width(c), 0) / 1000 * size;
        } else {
          const gids = [...r.text].map(ch => fb.font.encodeCharacter(ch.codePointAt(0)));
          adv = gids.reduce((a, g) => a + fb.font.advanceGlyph(g), 0) * size;
          if (r.text.trim()) {
            for (const ch of r.text) if (ch.trim()) missing.add(ch);
            if (!fbRefs.has(fb)) { const ref = doc.addFont(fb.font), alias = "AkiFB" + fbRefs.size + "_" + pno; fdict.put(alias, ref); fbRefs.set(fb, alias); }
            ops.push(`BT /${fbRefs.get(fb)} ${fmt(size)} Tf ${rgb} rg ${tm(pos)} <${gids.map(g => g.toString(16).toUpperCase().padStart(4, "0")).join("")}> Tj ET`);
          }
        }
        pos = [pos[0] + dir[0] * adv, pos[1] + dir[1] * adv];
      }
      if (missing.size) this.warnings.set(s.id, `Characters '${[...missing].sort().join("")}' are not available in the original PDF font; drawn with ${fb.label}.`);
      else if (!native) this.warnings.set(s.id, `Original font could not be reused (${this.fontStatus(s)}); drawn with ${fb ? fb.label : "a fallback font"}.`);
    }
    if (ops.length) {
      const old = pobj.get("Contents"), arr = doc.newArray();
      arr.push(doc.addStream("q\n", {}));
      if (old.isArray()) for (let i = 0; i < old.length; i++) arr.push(old.get(i)); else if (!old.isNull()) arr.push(old);
      arr.push(doc.addStream("\nQ\n", {}));
      arr.push(doc.addStream("q " + ops.join("\n") + " Q\n", {}));
      pobj.put("Contents", arr);
    }
    page.destroy?.();
  }

  render(pno, zoom = 2) {
    const page = this.doc.loadPage(pno);
    const pix = page.toPixmap(mupdf.Matrix.scale(zoom, zoom), mupdf.ColorSpace.DeviceRGB, false, true);
    const png = pix.asPNG().slice(); pix.destroy?.(); page.destroy?.(); return png;
  }

  save() { const buf = this.doc.saveToBuffer("garbage=compact,compress"); const out = buf.asUint8Array().slice(); buf.destroy?.(); return out; }

  close() { this.clearFallbacks(); this.doc.destroy?.(); }
}
