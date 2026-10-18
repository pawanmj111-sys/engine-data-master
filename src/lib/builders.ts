import * as XLSX from "xlsx";
import { buildFigure, figureToPng, plottedAoa, statsRows, STATS_HEAD } from "./figure";
import type { Block, ReportDoc } from "./report";
import { useApp, type FrontPage } from "./store";

type S = ReturnType<typeof useApp.getState>;

const visibleFields = (f: FrontPage): [string, string][] =>
  f.fields.filter((x) => !x.hidden || x.required).map((x) => [x.label, x.value]);

export function compareFrontFields(s: S): [string, string][] {
  if (s.cycle === "FTP")
    return [
      ["Date", s.ftpFront.date],
      ["Engine Model", s.ftpFront.engineModel],
      ["FTP File Name", s.ftpFront.ftpFileName],
    ];
  return visibleFields(s.compareFront);
}

export async function buildCompareReport(s: S): Promise<ReportDoc> {
  const blocks: Block[] = [];
  blocks.push({ type: "heading", text: "Datasets" });
  blocks.push({
    type: "text",
    text: `Test cycle: ${s.cycle}    Data type: ${s.dataType === "1hz" ? "1 Hz time-series data" : "Triggered / mode-wise data"}`,
  });
  blocks.push({
    type: "table",
    head: ["Display name", "Source file", "Version", "Sheet", "Header row", "Rows", "Columns", "Loaded"],
    body: s.datasets.map((d) => [d.name, d.fileName, `v${d.version}`, d.sheet, String(d.headerRow), String(d.rows.length), String(d.headers.length), d.loadedAt]),
  });
  for (const g of s.graphs) {
    const fig = buildFigure(g, s.datasets, s.dataType, false, s.parameterAliases);
    blocks.push({ type: "pagebreak" });
    blocks.push({ type: "heading", text: g.title });
    if (fig.data.length) {
      const src = await figureToPng(fig, 1400, 700);
      blocks.push({ type: "image", src, aspect: 2, caption: g.subtitle || undefined });
    } else blocks.push({ type: "text", text: "No plottable data for this graph." });
    const notes = [...fig.analysis.diffs.map((d) => `Alignment — ${d.label}: ${d.note}`), ...fig.analysis.warnings.map((w) => `Warning: ${w}`)];
    if (notes.length) blocks.push({ type: "text", text: notes.join("\n"), small: true });
    if (s.includeStats && fig.analysis.series.length)
      blocks.push({ type: "table", head: STATS_HEAD, body: statsRows(fig.analysis, g, s.datasets) });
    if (s.includeTables && fig.analysis.series.length) {
      const aoa = plottedAoa(fig.analysis, g, s.datasets);
      const maxCols = 10, maxRows = 300;
      const head = (aoa[0] as string[]).slice(0, maxCols);
      const body = aoa.slice(1, maxRows + 1).map((r) => r.slice(0, maxCols).map((c) => (c === null || c === undefined ? "" : String(c))));
      blocks.push({ type: "heading", text: `${g.title} — detailed results` });
      if (aoa.length - 1 > maxRows || aoa[0].length > maxCols)
        blocks.push({ type: "text", small: true, text: `Showing first ${Math.min(maxRows, aoa.length - 1)} rows and ${head.length} columns. Export the graph data to Excel for the complete table.` });
      blocks.push({ type: "table", head, body, small: true });
    }
  }
  return {
    title: s.cycle === "FTP" ? "FTP Test Data Comparison Report" : s.compareFront.title,
    subtitle: s.cycle === "FTP" ? "" : `${s.cycle} — Engine Test Data Comparison`,
    logo: s.cycle === "FTP" ? "" : s.compareFront.logo,
    fields: compareFrontFields(s),
    footer: `${s.cycle} Data Comparison`,
    blocks,
  };
}

export function buildCyclicReport(s: S): ReportDoc {
  const cols = s.cyclicColumns.filter((c) => c.visible);
  const blocks: Block[] = [
    { type: "heading", text: `Cyclic Emission Summary — ${s.cyclicCycle}` },
  ];
  if (s.cyclicUnits.trim()) blocks.push({ type: "text", text: `Units: ${s.cyclicUnits}` });
  blocks.push({
    type: "table",
    head: cols.map((c) => c.label),
    body: s.cyclicRecords.map((r, i) => cols.map((c) => (c.key === "sn" ? r.values.sn || String(i + 1) : r.values[c.key] ?? ""))),
  });
  blocks.push({ type: "text", small: true, text: "Blank cells indicate values not found in the source report. No values, limits or results have been inferred." });
  blocks.push({ type: "heading", text: "Source reports and extraction status" });
  blocks.push({
    type: "table",
    head: ["S. No.", "Source PDF", "Status", "Notes"],
    body: s.cyclicRecords.map((r, i) => [String(i + 1), r.source, r.status, r.message]),
    small: true,
  });
  return {
    title: s.cyclicFront.title,
    subtitle: `${s.cyclicCycle} Cyclic Emission Results`,
    logo: s.cyclicFront.logo,
    fields: visibleFields(s.cyclicFront),
    footer: `${s.cyclicCycle} Cyclic Emission Summary`,
    blocks,
  };
}

export function exportCompareWorkbook(s: S) {
  const wb = XLSX.utils.book_new();
  const frontRows: (string | number)[][] = [
    [s.cycle === "FTP" ? "FTP Test Data Comparison Report" : s.compareFront.title],
    ["Test Cycle", s.cycle],
    ["Data type", s.dataType === "1hz" ? "1 Hz time-series data" : "Triggered / mode-wise data"],
    [],
    ["Front-page field", "Value"],
    ...compareFrontFields(s),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(frontRows), "Front Page");

  const datasetRows: (string | number)[][] = [
    ["Display name", "Source file", "Version", "Sheet", "Header row", "Units row", "Rows", "Columns", "Loaded"],
    ...s.datasets.map((d) => [d.name, d.fileName, d.version, d.sheet, d.headerRow, d.unitsRow, d.rows.length, d.headers.length, d.loadedAt]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(datasetRows), "Datasets");

  const used = new Set<string>(["Front Page", "Datasets"]);
  const appendSheet = (requested: string, rows: unknown[][]) => {
    const base = requested.replace(/[\[\]*?:\/\\]/g, " ").trim().slice(0, 31) || "Sheet";
    let name = base;
    let number = 2;
    while (used.has(name)) {
      const suffix = " " + number++;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  };

  for (const [index, graph] of s.graphs.entries()) {
    const result = buildFigure(graph, s.datasets, s.dataType, false, s.parameterAliases);
    const graphData = plottedAoa(result.analysis, graph, s.datasets);
    appendSheet("Graph " + (index + 1) + " Data", graphData);
    appendSheet("Graph " + (index + 1) + " Stats", [STATS_HEAD, ...statsRows(result.analysis, graph, s.datasets)]);
    if (result.analysis.diffs.length) {
      appendSheet("Graph " + (index + 1) + " Alignment", [
        ["Difference", "Alignment method"],
        ...result.analysis.diffs.map((diff) => [diff.label, diff.note]),
      ]);
    }
    if (result.analysis.warnings.length) {
      appendSheet("Graph " + (index + 1) + " Review", [["Review warning"], ...result.analysis.warnings.map((warning) => [warning])]);
    }
  }
  XLSX.writeFile(wb, (s.cycle === "FTP" ? "FTP" : s.cycle) + "_comparison_report.xlsx");
}

