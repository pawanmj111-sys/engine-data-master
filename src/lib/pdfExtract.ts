import type { CyclicCycle, CyclicRecord } from "./store";
import { uid } from "./store";

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

export async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join("  ")));
  }
  return lines;
}

const NUM = /[-+]?\d+(?:[.,]\d+)?(?:\s*[x×]\s*10\s*\^?\s*[-+]?\d+|[eE][-+]?\d+)?/g;
const normNum = (s: string) => s.replace(/\s+/g, "").replace(",", ".").replace(/[x×]10\^?/, "E");

const POLL: { key: string; re: RegExp }[] = [
  { key: "noxThc", re: /\b(NOx\s*\+\s*T?HC|T?HC\s*\+\s*NOx)\b/i },
  { key: "nox", re: /\bNOx\b(?!\s*\+)/i },
  { key: "hc", re: /(?<!\+\s*)\b(THC|HC)\b(?!\s*\+)/i },
  { key: "co", re: /\bCO\b(?!2)/ },
  { key: "pm", re: /\bPM\b/ },
  { key: "pn", re: /\bPN\b/ },
];

function labelPositions(line: string) {
  const found: { key: string; idx: number }[] = [];
  let work = line;
  for (const p of POLL) {
    const m = work.match(p.re);
    if (m && m.index !== undefined) {
      found.push({ key: p.key, idx: m.index });
      work = work.slice(0, m.index) + " ".repeat(m[0].length) + work.slice(m.index + m[0].length);
    }
  }
  return found.sort((a, b) => a.idx - b.idx);
}

function numsAfterLabel(line: string) {
  // strip leading labels/units so only values remain
  return (line.replace(/\b(NOx|T?HC|CO2?|PM|PN)\b/gi, " ").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\b\w*\/kWh\b/g, " ").match(NUM) ?? []).map(normNum);
}

export function extractFromLines(lines: string[], fileName: string, cycle: CyclicCycle): CyclicRecord {
  const rec: CyclicRecord = { id: uid(), source: fileName, status: "review", message: "", sectionText: "", values: {} };
  const full = lines.join("\n");
  if (full.replace(/\s/g, "").length < 30) {
    rec.status = "no-text";
    rec.message = "No extractable text found (likely a scanned PDF). OCR is not available in this version — enter values manually.";
    return rec;
  }
  const notes: string[] = [];
  let start = lines.findIndex((l) => /Emission\s*limits\s*[-–—:]?\s*Stage\s*V\s*NRE/i.test(l));
  if (start < 0) {
    start = lines.findIndex((l) => /(emission\s+results|specific\s+emissions|weighted\s+(cycle\s+)?results|brake.specific)/i.test(l));
    notes.push(start < 0 ? 'Section "Emission limits - Stage V NRE" not found.' : 'Section "Emission limits - Stage V NRE" not found; used nearest emission results section.');
  }
  const section = start >= 0 ? lines.slice(start, start + 40) : [];
  rec.sectionText = section.join("\n");

  const results: Record<string, string> = {};
  const limits: Record<string, string> = {};
  // Layout 1: header line with several pollutant labels, values on following lines
  for (let i = 0; i < section.length; i++) {
    const labels = labelPositions(section[i]);
    if (labels.length < 2 || (section[i].match(NUM) ?? []).length >= labels.length) continue;
    for (let j = i + 1; j < Math.min(section.length, i + 6); j++) {
      const nums = section[j].match(NUM)?.map(normNum) ?? [];
      if (nums.length < labels.length) continue;
      const vals = nums.slice(-labels.length);
      const target = /limit/i.test(section[j]) ? limits : /result|measured|value|actual|cycle/i.test(section[j]) || !Object.keys(results).length ? results : null;
      if (!target) continue;
      labels.forEach((l, k) => { if (!target[l.key]) target[l.key] = vals[k]; });
    }
    if (Object.keys(results).length) { notes.push("Values read from tabular layout (header row + value rows)."); break; }
  }
  // Layout 2: one pollutant per line → first number = result, second = limit
  if (!Object.keys(results).length) {
    for (const ln of section) {
      const labels = labelPositions(ln);
      if (labels.length !== 1) continue;
      const nums = numsAfterLabel(ln);
      if (!nums.length) continue;
      const k = labels[0].key;
      if (!results[k]) results[k] = nums[0];
      if (nums[1] && !limits[k]) limits[k] = nums[1];
    }
    if (Object.keys(results).length) notes.push("Values read per line: first number taken as result, second as limit — please verify.");
  }
  Object.assign(rec.values, results);
  const limStr = Object.entries(limits).map(([k, v]) => `${({ noxThc: "NOx+THC", nox: "NOx", hc: "HC", co: "CO", pm: "PM", pn: "PN" } as Record<string, string>)[k]} ≤ ${v}`);
  if (limStr.length) rec.values.limits = limStr.join("; ");
  if (results.noxThc && !results.nox) notes.push("Source reports combined NOx+THC; separate NOx/THC not assumed.");

  const pf = rec.sectionText.match(/\b(PASS(?:ED)?|FAIL(?:ED)?)\b/i);
  if (pf) rec.values.result = /^p/i.test(pf[1]) ? "Pass" : "Fail";
  const rem = section.find((l) => /remark|comment/i.test(l));
  if (rem) rec.values.remarks = rem.replace(/^.*?(remarks?|comments?)\s*[:\-]?\s*/i, "").trim();

  const grab = (re: RegExp) => { for (const l of lines) { const m = l.match(re); if (m) return m[m.length - 1].trim(); } return ""; };
  rec.values.date = grab(/\b(?:Test\s*)?Date\s*[:\-]?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/i);
  rec.values.testId = grab(/Test\s*(?:ID|No\.?|Number)\s*[:\-]?\s*([A-Za-z0-9_\-./]+)/i);
  rec.values.testName = grab(/Test\s*Name\s*[:\-]\s*(.+?)(?:\s{2,}|$)/i);
  rec.values.engine = grab(/Engine\s*(?:Model|Type|No\.?|Number|S\/N|Serial)\s*[:\-]?\s*(.+?)(?:\s{2,}|$)/i);

  const others = (["NRTC", "NRSC", "RMC"] as const).filter((c) => c !== cycle && new RegExp(`\\b${c}\\b`).test(full));
  if (!new RegExp(`\\b${cycle}\\b`).test(full) && others.length)
    notes.push(`Report mentions ${others.join("/")} but not ${cycle} — check that the right cycle is selected.`);

  const got = Object.keys(results).length;
  rec.status = got && start >= 0 ? "extracted" : "review";
  if (!got) notes.push("No emission values recognised — requires manual review.");
  rec.message = notes.join(" ");
  return rec;
}

export async function extractPdf(file: File, cycle: CyclicCycle): Promise<CyclicRecord> {
  try {
    return extractFromLines(await pdfLines(file), file.name, cycle);
  } catch (e) {
    return { id: uid(), source: file.name, status: "error", message: `Could not read PDF: ${(e as Error).message}`, sectionText: "", values: {} };
  }
}
