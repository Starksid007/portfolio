// Supplies installed fonts for characters missing from a PDF's embedded subset.
// Uses the Local Font Access API (Chrome/Edge, after the user grants permission).

const u16 = (d, o) => (d[o] << 8) | d[o + 1];
const u32 = (d, o) => ((d[o] << 24) >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];

// PostScript name (name id 6) of the sfnt face starting at `off`.
export function psNameAt(d, off) {
  const n = u16(d, off + 4);
  for (let i = 0; i < n; i++) {
    const r = off + 12 + 16 * i;
    if (String.fromCharCode(d[r], d[r + 1], d[r + 2], d[r + 3]) !== "name") continue;
    const t = u32(d, r + 8), count = u16(d, t + 2), so = u16(d, t + 4);
    let best = null;
    for (let j = 0; j < count; j++) {
      const e = t + 6 + 12 * j, pid = u16(d, e), nid = u16(d, e + 6), len = u16(d, e + 8), o = u16(d, e + 10);
      if (nid !== 6) continue;
      const s = t + so + o; let str = "";
      if (pid === 0 || pid === 3) for (let k = 0; k + 1 < len; k += 2) str += String.fromCharCode(u16(d, s + k));
      else for (let k = 0; k < len; k++) str += String.fromCharCode(d[s + k]);
      if (str) { best = str; if (pid === 3) break; }
    }
    return best;
  }
  return null;
}

// Index of the face named `ps` inside a font file (0 for single-face files).
export function faceIndex(d, ps) {
  if (String.fromCharCode(d[0], d[1], d[2], d[3]) !== "ttcf") return 0;
  const n = u32(d, 8);
  for (let k = 0; k < n; k++) if (psNameAt(d, u32(d, 12 + 4 * k)) === ps) return k;
  return 0;
}

export const localFontsSupported = () => typeof window !== "undefined" && "queryLocalFonts" in window;

let fontList = null;
export async function localFontsGranted() {
  if (!localFontsSupported()) return false;
  try { const p = await navigator.permissions.query({ name: "local-fonts" }); return p.state === "granted"; } catch (e) { return false; }
}
// Must be called from a user gesture the first time (Chrome shows a permission prompt).
export async function enableLocalFonts() {
  if (!localFontsSupported()) return false;
  try { fontList = await window.queryLocalFonts(); return fontList.length > 0; } catch (e) { fontList = null; return false; }
}
export const localFontsEnabled = () => !!(fontList && fontList.length);

const normName = s => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(psmt|mt|ps)$/, "");

// fontProvider for Editor: returns {data, index} or null.
export async function provideFont(ps) {
  if (!fontList) return null;
  let hit = fontList.find(f => f.postscriptName === ps);
  if (!hit) { const n = normName(ps); hit = fontList.find(f => normName(f.postscriptName) === n) || fontList.find(f => normName(f.postscriptName) === n + "regular"); }
  if (!hit) return null;
  const data = new Uint8Array(await (await hit.blob()).arrayBuffer());
  return { data, index: faceIndex(data, hit.postscriptName) };
}
