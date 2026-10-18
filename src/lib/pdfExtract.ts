import type { CyclicCycle, CyclicRecord } from "./store";
import { uid } from "./store";

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

export interface PositionedPdfTextItem {
  page: number;
  x: number;
  y: number;
  text: string;
}

async function readPdfData(file: File): Promise<{ lines: string[]; items: PositionedPdfTextItem[] }> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  const positioned: PositionedPdfTextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      positioned.push({ page: p, x, y, text: it.str.trim() });
      const rowY = Math.round(y / 2) * 2;
      if (!rows.has(rowY)) rows.set(rowY, []);
      rows.get(rowY)!.push({ x, s: it.str.trim() });
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join("  ")));
  }
  return { lines, items: positioned };
}

export async function pdfLines(file: File): Promise<string[]> {
  return (await readPdfData(file)).lines;
}

const NUMBER_SOURCE = "[-+]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:\\s*[x×]\\s*10\\s*\\^?\\s*[-+]?\\d+|[eE][-+]?\\d+)?";
const NUM = new RegExp(NUMBER_SOURCE, "g");
const normNum = (s: string) => s.replace(/\s+/g, "").replace(",", ".").replace(/[x×]10\^?/, "E");


const ENGINE_OUT_SPECIFIC_DEFS: { key: string; label: string; re: RegExp }[] = [
  { key: "engineOutCH4", label: "CH4", re: /^\s*CH4\b/i },
  { key: "engineOutCO2", label: "CO2", re: /^\s*CO2\b/i },
  { key: "engineOutCOH", label: "COH", re: /^\s*COH\b/i },
  { key: "engineOutCO", label: "CO (COH - EngineOut)", re: /^\s*CO\s*\(\s*COH\s*-\s*EngineOut\s*\)/i },
  { key: "engineOutTHC", label: "THC", re: /^\s*THC\b/i },
  { key: "engineOutNO2", label: "NO2 (NOX,NO - EngineOut)", re: /^\s*NO2\s*\(\s*NOX\s*,\s*NO\s*-\s*EngineOut\s*\)/i },
  { key: "engineOutNOX", label: "NOX", re: /^\s*NOX\b/i },
  { key: "engineOutNO", label: "NO", re: /^\s*NO\b/i },
  { key: "engineOutO2", label: "O2", re: /^\s*O2\b/i },
];

function valuesFromSpecificRows(rows: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const def of ENGINE_OUT_SPECIFIC_DEFS) {
    const row = rows.find((line) => def.re.test(line));
    if (!row) continue;
    const label = def.re.exec(row);
    if (!label) continue;
    const value = row.slice(label[0].length).match(NUM)?.map(normNum)?.[0];
    if (value) values[def.key] = value;
  }
  return values;
}

function engineOutDetailsFromValues(values: Record<string, string>): string {
  return ENGINE_OUT_SPECIFIC_DEFS
    .filter((def) => values[def.key] !== undefined)
    .map((def) => def.label + ": " + values[def.key] + " g/kWh")
    .join("\n");
}

/**
 * Uses PDF.js item coordinates to select the rightmost "Specific results" table.
 * This matters because each PDF page places Concentrations, Mass results and Specific results side by side.
 */
export function parseEngineOutSpecificResultsFromItems(items: PositionedPdfTextItem[]): Record<string, string> {
  const pages = [...new Set(items.map((item) => item.page))];
  for (const page of pages) {
    const pageItems = items.filter((item) => item.page === page);
    const pageText = pageItems.map((item) => item.text).join(" ");
    if (!/EngineOut/i.test(pageText) || !/bench\s+results/i.test(pageText) || !/not\s+driftcorrected/i.test(pageText)) continue;

    const groups = new Map<number, PositionedPdfTextItem[]>();
    for (const item of pageItems) {
      const y = Math.round(item.y / 2) * 2;
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y)!.push(item);
    }
    const rows = [...groups.entries()].map(([y, rowItems]) => ({
      y,
      items: rowItems.sort((a, b) => a.x - b.x),
      text: rowItems.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "),
    }));
    const heading = rows.find((row) => /Specific\s+results/i.test(row.text));
    if (!heading) continue;
    const headingItem = heading.items.find((item) => /Specific/i.test(item.text));
    if (!headingItem) continue;

    // The next section begins at "Fuel consumption"; use it to keep other tables/metadata out.
    const lowerHeading = rows
      .filter((row) => row.y < heading.y && row.items.some((item) => /^Fuel\s+consumption$/i.test(item.text.trim())))
      .sort((a, b) => b.y - a.y)[0];
    const lowerY = lowerHeading?.y ?? heading.y - 180;
    const specificRows = rows
      .filter((row) => row.y < heading.y - 2 && row.y > lowerY + 2)
      .map((row) => row.items
        .filter((item) => item.x >= headingItem.x - 20)
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" "))
      .filter((row) => row.trim().length > 0);
    const values = valuesFromSpecificRows(specificRows);
    if (Object.keys(values).length > 0) return values;
  }
  return {};
}

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
  const explicitSampleMatch = /\bSample\s*point\s*[:=]?\s*(.+?)(?=\s+Device\b|$)/i.exec(block);
  const explicitDeviceMatch = /\bDevice\s*[:=]?\s*([^\s,;]+)/i.exec(block);
  const afterStatus = statusMatch ? block.slice(statusMatch.index + statusMatch[0].length).trim() : "";
  const trailingColumns = afterStatus.replace(/^Sample\s*point\s*[:=]?\s*/i, "").replace(/^Device\s*[:=]?\s*/i, "").split(/\s+/).filter(Boolean);
  const samplePoint = explicitSampleMatch?.[1]?.trim() ?? (trailingColumns.length >= 2 ? trailingColumns[0] : "");
  const device = explicitDeviceMatch?.[1]?.trim() ?? (trailingColumns.length >= 2 ? trailingColumns[1] : "");
  return {
    def, actual, limit,
    status: statusMatch ? (/^P/i.test(statusMatch[1]) ? "Passed" : "Failed") : "",
    samplePoint,
    device,
  };
}

function parseSpecificResults(lines: string[]) {
  const start = lines.findIndex((line, i) => /Specific\s+results\s+Phase\s*1/i.test(line) ||
    (/Specific\s+results/i.test(line) && /Phase\s*1/i.test(lines[i + 1] ?? "")));
  if (start < 0 || !lines.slice(Math.max(0, start - 12), start).some((line) => /EngineOut/i.test(line))) return "";
  const section = lines.slice(start + 1, start + 56);
  return engineOutDetailsFromValues(valuesFromSpecificRows(section));
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
    const overall = /\boverall\s+status\s*[:-]?\s*(PASS(?:ED)?|FAIL(?:ED)?)/i.exec(full);
    if (overall) values.result = /^P/i.test(overall[1]) ? "Pass" : "Fail";
    else {
      const firstRow = best!.section.findIndex((line) => SUMMARY_POLLUTANTS.some((p) => p.re.test(line)));
      const beforeRows = best!.section.slice(0, firstRow < 0 ? 1 : firstRow + 1).join(" ");
      const status = /\bStatus\s*[:-]?\s*(PASS(?:ED)?|FAIL(?:ED)?)\b/i.exec(beforeRows);
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
  values.date = grab(/\b(?:Test\s*)?Date\s*[:-]?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/i);
  values.testId = grab(/Test\s*(?:ID|No\.?|Number)\s*[:-]?\s*([A-Za-z0-9_./-]+)/i);
  values.testName = grab(/Test\s*Name\s*[:-]\s*(.+?)(?:\s{2,}|$)/i);
  values.engine = grab(/Engine\s*(?:Model|Type|No\.?|Number|S\/N|Serial)\s*[:-]?\s*(.+?)(?:\s{2,}|$)/i);
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
    const pdfData = await readPdfData(file);
    const record = extractFromLines(pdfData.lines, file.name, cycle);
    const engineOutValues = parseEngineOutSpecificResultsFromItems(pdfData.items);
    if (Object.keys(engineOutValues).length > 0) {
      if (record.status !== "extracted") record.status = "extracted";
      Object.assign(record.values, engineOutValues);
      record.values.engineOutDetails = engineOutDetailsFromValues(engineOutValues);
      record.message = [record.message, "EngineOut (EBH01) bench results — Specific results Phase 1 extracted from the rightmost table using PDF text coordinates."]
        .filter(Boolean).join(" ");
    }
    return record;
  } catch (e) {
    return { id: uid(), source: file.name, status: "error", message: "Could not read PDF: " + (e as Error).message, sectionText: "", values: {} };
  }
}
