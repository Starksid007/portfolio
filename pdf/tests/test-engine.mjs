// Headless engine test: node/bun tests/test-engine.mjs <in.pdf> <out.pdf> '<json {old:new}>' [fontsdir]
import fs from "node:fs";
import path from "node:path";
import { Editor } from "../engine.js";
import { faceIndex, psNameAt } from "../fontsource.js";

const [inp, out, editsJson] = process.argv.slice(2);
const edits = JSON.parse(editsJson);

// test font provider: scan macOS font dirs like Chrome's local-font list would
const dirs = ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts"];
const index = new Map();
for (const d of dirs) { if (!fs.existsSync(d)) continue;
  for (const fn of fs.readdirSync(d)) { if (!/\.(ttf|otf|ttc)$/i.test(fn)) continue;
    const p = path.join(d, fn); const data = new Uint8Array(fs.readFileSync(p));
    try { if (String.fromCharCode(...data.slice(0, 4)) === "ttcf") { const n = (data[8] << 24 | data[9] << 16 | data[10] << 8 | data[11]) >>> 0;
        for (let k = 0; k < n; k++) { const o = 12 + 4 * k, off = ((data[o] << 24) >>> 0) + (data[o + 1] << 16) + (data[o + 2] << 8) + data[o + 3]; const nm = psNameAt(data, off); if (nm && !index.has(nm)) index.set(nm, p); } }
      else { const nm = psNameAt(data, 0); if (nm && !index.has(nm)) index.set(nm, p); } } catch (e) {} } }
const provider = process.env.NO_LOCAL_FONTS ? null : async ps => { const p = index.get(ps); if (!p) return null; const data = new Uint8Array(fs.readFileSync(p)); return { data, index: faceIndex(data, ps) }; };

const t0 = Date.now();
const ed = new Editor(fs.readFileSync(inp), path.basename(inp), { fontProvider: provider });
console.log(`opened ${ed.pageCount} page(s) in ${Date.now() - t0} ms`);
const all = [];
for (let i = 0; i < ed.pageCount; i++) all.push(...ed.spanList(i));
for (const s of all) console.log(`  ${JSON.stringify(s.text).padEnd(34)} ${s.font.padEnd(22)} native=${s.native}`);
for (const s of all) { const k = s.text.trim(); if (k in edits) { const nt = s.text.replace(k, edits[k]); console.log("check", JSON.stringify(nt), JSON.stringify(await ed.check(s.id, nt))); await ed.setEdit(s.id, nt); } }
console.log("warnings", JSON.stringify(Object.fromEntries(ed.warnings)));
const before = ed.edits.size; await ed.undo(); console.log(`undo: ${before} -> ${ed.edits.size} edits`);
// re-apply all edits cleanly for output
for (const s of all) { const k = s.text.trim(); if (k in edits) await ed.setEdit(s.id, s.text.replace(k, edits[k])); }
fs.writeFileSync(out, ed.save());
for (let i = 0; i < ed.pageCount; i++) fs.writeFileSync(out.replace(/\.pdf$/, `_p${i}.png`), ed.render(i, 2));
console.log("saved", out);
