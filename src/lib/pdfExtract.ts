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
    [...rows.entries()].sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join("  ")));
  }
  return lines;
}

const NUMBER_SOURCE = "[-+]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:\\s*[x×]\\s*10\\s*\\^?\\s*[-+]?\\d+|[eE][-+]?\\d+)?";
const NUM = new RegExp(NUMBER_SOURCE, "g");
const normNum = (s: string) => s.replace(/\s+/g, "").replace(",", ".").replace(/[x×]10\^?/, "E");

const POLL: { key: string; re: RegExp }[] = [
  { key: "noxThc", re: /\b(NOx\s*\+\s*T?HC|T?HC\s*\+\s*NOx)\b/i },
  { key: "nox", re: /\bNOx\b(?!\s*\+)/i },
  { key: "hc", re: /(?<!\+\s*)\b(THC|HC)\b(?!\s*\+)/i },
  { key: "co", re: /\bCO\b(?!2|H)/i },
  { key: "pm", re: /\bPM\b/i },
  { key: "pn", re: /\bPN\b/i },
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
  return (line.replace(/\b(NOx|T?HC|CO2?|PM|PN)\b/gi, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\b\w*\/kWh\b/gi, " ").match(NUM) ?? []).map(normNum);
}

type SummaryPollutant = { key: "co" | "noxHc" | "noxThc" | "pm" | "pn"; label: string; re: RegExp; actualKey: string };
const SUMMARY_POLLUTANTS: SummaryPollutant[] = [
  { key: "co", label: "CO uncorrected", re: /\bCO\s+uncorrected\b/i, actualKey: "co" },
  { key: "noxHc", label: "NOX+HC", re: /\bNOX?\s*\+\s*HC\b/i, actualKey: "noxHc" },
  { key: "noxThc", label: "NOX+THC", re: /\bNOX?\s*\+\s*THC\b/i, actualKey: "noxThc" },
  { key: "pm", label: "Particulate mass", re: /\bParticulate\s+mass\b/i, actualKey: "pm" },
  { key: "pn", label: "Particulate number", re: /\bParticulate\s+number\b/i, actualKey: "pn" },
];

function hasSummaryHeading(line: string) {
  return /Emission\s*limits\s*[-–—:]?\s*Stage\s*V\s*NRE/i.test(line);
}

function collectSummaryCandidates(lines: string[]) {
  const starts = lines.map((line, i) => hasSummaryHeading(line) ? i : -1).filter((i) => i >= 0);
  return starts.map((start) => {
    const nextHeading = starts.find((n) => n > start);
    const end = Math.min(start + 70, nextHeading ?? lines.length);
    const section = lines.slice(start, end);
    const text = section.join(" ");
    const rowCount = SUMMARY_POLLUTANTS.filter((p) => p.re.test(text)).length;
    const hasRequestedRevision = /NRE\s*[-_]\s*v\s*[-_]\s*3\s*\/\s*NRE\s*[-_]\s*c\s*[-_]\s*3/i.test(text);
    const hasOverallStatus = /overall\s+status/i.test(text);
    return { start, section, joined: section.join("\n"), rowCount, hasRequestedRevision, score: rowCount * 5 + (hasRequestedRevision ? 100 : 0) + (hasOverallStatus ? 3 : 0) };
  });
}

function parseNamedRow(text: string, def: SummaryPollutant, allDefs: SummaryPollutant[]) {
  const startMatch = def.re.exec(text);
  if (!startMatch || startMatch.index === undefined) return null;
  const start = startMatch.index;
  let end = text.length;
  for (const other of allDefs) {
    if (other.key === def.key) continue;
    const m = other.re.exec(text);
    if (m?.index !== undefined && m.index > start && m.index < end) end = m.index;
  }
  const block = text.slice(start, end).replace(/\s+/g, " ").trim();
  const actualMatch = new RegExp("\\bActual\\s*[:=]?\\s*(" + NUMBER_SOURCE + ")", "i").exec(block);
  const limitMatch = new RegExp("\\bLimit\\s*[:=]?\\s*(" + NUMBER_SOURCE + ")", "i").exec(block);
  const allNums = block.match(NUM)?.map(normNum) ?? [];
  const actual = actualMatch?.[1] ? normNum(actualMatch[1]) : allNums[0] ?? "";
  const limit = limitMatch?.[1] ? normNum(limitMatch[1]) : allNums[1] ?? "";
  if (!actual && !limit) return null;
  const statusMatch = /\b(PASS(?:ED)?|FAIL(?:ED)?)\b/i.exec(block);
  const sampleMatch = /\bSample\s*point\s*[:=]?\s*(.+?)(?=\s+Device\b|$)/i.exec(block);
  const deviceMatch = /\bDevice\s*[:=]?\s*([^\s,;]+)/i.exec(block);
  return {
    def, actual, limit,
    status: statusMatch ? (/^P/i.test(statusMatch[1]) ? "Passed" : "Failed") : "",
    samplePoint: sampleMatch?.[1]?.trim() ?? "",
    device: deviceMatch?.[1]?.trim() ?? "",
  };
}

function parseSpecificResults(lines: string[]) {
  const start = lines.findIndex((line, i) => /Specific\s+results\s+Phase\s*1/i.test(line) ||
    (/Specific\s+results/i.test(line) && /Phase\s*1/i.test(lines[i + 1] ?? "")));
  if (start < 0 || !lines.slice(Math.max(0, start - 12), start).some((line) => /EngineOut/i.test(line))) return "";
  const section = lines.slice(start, start + 55);
  const defs: { label: string; re: RegExp }[] = [
    { label: "CH4", re: /^\s*CH4\b/i }, { label: "CO2", re: /^\s*CO2\b/i },
    { label: "COH", re: /^\s*COH\b/i }, { label: "CO (COH - EngineOut)", re: /^\s*CO\b(?!2|H)/i },
    { label: "THC", re: /^\s*THC\b/i }, { label: "NO2 (NOX,NO - EngineOut)", re: /^\s*NO2\b/i },
    { label: "NOX", re: /^\s*NOX\b/i }, { label: "NO", re: /^\s*NO\b(?![A-Z0-9])/i }, { label: "O2", re: /^\s*O2\b/i },
  ];
  const out: string[] = [];
  for (const def of defs) {
    const ix = section.findIndex((line) => def.re.test(line));
    if (ix < 0) continue;
    const candidate = section[ix];
    const labelMatch = def.re.exec(candidate);
    const afterLabel = labelMatch?.index !== undefined ? candidate.slice(labelMatch.index + labelMatch[0].length) : candidate;
    let nums = afterLabel.match(NUM)?.map(normNum) ?? [];
    if (!nums.length) {
      for (let j = ix + 1; j < Math.min(section.length, ix + 3); j++) {
        if (defs.some((other) => other.label !== def.label && other.re.test(section[j]))) break;
        nums = section[j].match(NUM)?.map(normNum) ?? [];
        if (nums.length) break;
      }
    }
    if (nums.length) out.push(def.label + ": " + nums[0] + " g/kWh");
  }
  return out.join("\n");
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
  const candidates = collectSummaryCandidates(lines);
  const best = [...candidates].sort((a, b) => b.score - a.score)[0];
  let start = best?.start ?? -1;
  let section = best?.section ?? [];
  if (start < 0) {
    start = lines.findIndex((l) => /(emission\s+results|specific\s+emissions|weighted\s+(cycle\s+)?results|brake.specific)/i.test(l));
    section = start >= 0 ? lines.slice(start, start + 40) : [];
    notes.push(start < 0 ? 'Section "Emission limits - Stage V NRE" not found.' : 'Stage V NRE table heading not found; a generic emission results section was selected for review.');
  } else if (!best?.hasRequestedRevision) {
    notes.push('Exact heading "(NRE-v-3/NRE-c-3)" was not found. Verify that the selected Stage V section is the top-level summary.');
  }
  rec.sectionText = section.join("\n");

  const values: Record<string, string> = {};
  const details: string[] = [];
  const limitParts: string[] = [];
  let parsedSummaryRows = 0;
  if (best && best.rowCount > 0) {
    for (const def of SUMMARY_POLLUTANTS) {
      const row = parseNamedRow(best.joined, def, SUMMARY_POLLUTANTS);
      if (!row) continue;
      parsedSummaryRows++;
      if (row.actual) values[row.def.actualKey] = row.actual;
      if (row.limit) {
        values[row.def.actualKey + "Limit"] = row.limit;
        limitParts.push(row.def.label + " ≤ " + row.limit);
      }
      if (row.status) values[row.def.actualKey + "Status"] = row.status;
      if (row.samplePoint) values[row.def.actualKey + "SamplePoint"] = row.samplePoint;
      if (row.device) values[row.def.actualKey + "Device"] = row.device;
      const parts = [
        row.actual ? "Actual: " + row.actual : "Actual: not extracted",
        row.limit ? "Limit: " + row.limit : "Limit: not extracted",
        row.status || "Status: not extracted",
        row.samplePoint ? "Sample point: " + row.samplePoint : "",
        row.device ? "Device: " + row.device : "",
      ].filter(Boolean);
      details.push(row.def.label + " — " + parts.join("; "));
    }
  }

  if (details.length) {
    values.emissionLimitDetails = details.join("\n");
    if (limitParts.length) values.limits = limitParts.join("; ");
    const overall = /\boverall\s+status\s*[:\-]?\s*(PASS(?:ED)?|FAIL(?:ED)?)/i.exec(full);
    if (overall) values.result = /^P/i.test(overall[1]) ? "Pass" : "Fail";
    else {
      const firstRow = best!.section.findIndex((line) => SUMMARY_POLLUTANTS.some((p) => p.re.test(line)));
      const beforeRows = best!.section.slice(0, firstRow < 0 ? 1 : firstRow + 1).join(" ");
      const status = /\bStatus\s*[:\-]?\s*(PASS(?:ED)?|FAIL(?:ED)?)\b/i.exec(beforeRows);
      if (status) values.result = /^P/i.test(status[1]) ? "Pass" : "Fail";
    }
    if (best!.hasRequestedRevision) notes.push("Selected the explicit NRE-v-3/NRE-c-3 Stage V summary heading.");
    notes.push("Read " + parsedSummaryRows + " pollutant row(s) from the selected Stage V summary. Verify all values before export.");
  }

  const genericResults: Record<string, string> = {};
  const genericLimits: Record<string, string> = {};
  if (!parsedSummaryRows && section.length) {
    for (let i = 0; i < section.length; i++) {
      const labels = labelPositions(section[i]);
      if (labels.length < 2 || (section[i].match(NUM) ?? []).length >= labels.length) continue;
      for (let j = i + 1; j < Math.min(section.length, i + 6); j++) {
        const nums = section[j].match(NUM)?.map(normNum) ?? [];
        if (nums.length < labels.length) continue;
        const vals = nums.slice(-labels.length);
        const target = /limit/i.test(section[j]) ? genericLimits : /result|measured|value|actual|cycle/i.test(section[j]) || !Object.keys(genericResults).length ? genericResults : null;
        if (!target) continue;
        labels.forEach((l, k) => { if (!target[l.key]) target[l.key] = vals[k]; });
      }
      if (Object.keys(genericResults).length) break;
    }
    if (!Object.keys(genericResults).length) {
      for (const line of section) {
        const labels = labelPositions(line);
        if (labels.length !== 1) continue;
        const nums = numsAfterLabel(line);
        if (!nums.length) continue;
        if (!genericResults[labels[0].key]) genericResults[labels[0].key] = nums[0];
        if (nums[1] && !genericLimits[labels[0].key]) genericLimits[labels[0].key] = nums[1];
      }
    }
    Object.assign(values, genericResults);
    const labelMap: Record<string, string> = { noxThc: "NOx+THC", nox: "NOx", hc: "HC", co: "CO", pm: "PM", pn: "PN" };
    const limits = Object.entries(genericLimits).map(([k, v]) => (labelMap[k] ?? k) + " ≤ " + v);
    if (limits.length) values.limits = limits.join("; ");
    if (Object.keys(genericResults).length) notes.push("Generic layout fallback used; manually verify extracted results and limits.");
  }

  const engineOutDetails = parseSpecificResults(lines);
  if (engineOutDetails) values.engineOutDetails = engineOutDetails;
  const grab = (re: RegExp) => { for (const line of lines) { const m = line.match(re); if (m) return m[m.length - 1].trim(); } return ""; };
  values.date = grab(/\b(?:Test\s*)?Date\s*[:\-]?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/i);
  values.testId = grab(/Test\s*(?:ID|No\.?|Number)\s*[:\-]?\s*([A-Za-z0-9_\-./]+)/i);
  values.testName = grab(/Test\s*Name\s*[:\-]\s*(.+?)(?:\s{2,}|$)/i);
  values.engine = grab(/Engine\s*(?:Model|Type|No\.?|Number|S\/N|Serial)\s*[:\-]?\s*(.+?)(?:\s{2,}|$)/i);
  Object.assign(rec.values, values);

  const cycles = ["NRTC", "NRSC", "RMC"] as const;
  const others = cycles.filter((c) => c !== cycle && new RegExp("\\b" + c + "\\b").test(full));
  if (!new RegExp("\\b" + cycle + "\\b").test(full) && others.length)
    notes.push("Report mentions " + others.join("/") + " but not " + cycle + " — check that the right cycle is selected.");

  const recognized = parsedSummaryRows || Object.keys(genericResults).length;
  rec.status = recognized && start >= 0 ? "extracted" : "review";
  if (!recognized) notes.push("No emission values recognised — requires manual review.");
  if (engineOutDetails) notes.push("EngineOut EBH01 Specific results Phase 1 was extracted separately from the Stage V summary.");
  rec.message = notes.join(" ");
  return rec;
}

export async function extractPdf(file: File, cycle: CyclicCycle): Promise<CyclicRecord> {
  try {
    return extractFromLines(await pdfLines(file), file.name, cycle);
  } catch (e) {
    return { id: uid(), source: file.name, status: "error", message: "Could not read PDF: " + (e as Error).message, sectionText: "", values: {} };
  }
}
