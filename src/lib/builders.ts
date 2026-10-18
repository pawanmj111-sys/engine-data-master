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
  const engineOutKeys = [
    ["engineOutCH4", "CH4 [g/kWh]"],
    ["engineOutCO2", "CO2 [g/kWh]"],
    ["engineOutCOH", "COH [g/kWh]"],
    ["engineOutCO", "CO (COH - EngineOut) [g/kWh]"],
    ["engineOutTHC", "THC [g/kWh]"],
    ["engineOutNO2", "NO2 (NOX,NO - EngineOut) [g/kWh]"],
    ["engineOutNOX", "NOX [g/kWh]"],
    ["engineOutNO", "NO [g/kWh]"],
    ["engineOutO2", "O2 [g/kWh]"],
  ] as const;
  const engineOutRecords = s.cyclicRecords.filter((record) =>
    engineOutKeys.some(([key]) => Boolean(record.values[key])),
  );
  if (engineOutRecords.length) {
    blocks.push({ type: "heading", text: "EngineOut (EBH01) bench results — not driftcorrected · Specific results Phase 1" });
    blocks.push({
      type: "table",
      head: ["Source PDF", ...engineOutKeys.map(([, label]) => label)],
      body: engineOutRecords.map((record) => [
        record.source,
        ...engineOutKeys.map(([key]) => record.values[key] ?? ""),
      ]),
      small: true,
    });
  }
  const tailpipeKeys = [
    ["tailpipeCH4", "CH4 [g/kWh]"],
    ["tailpipeCO2", "CO2 [g/kWh]"],
    ["tailpipeCOL", "COL [g/kWh]"],
    ["tailpipeCO", "CO (COL - Tailpipe) [g/kWh]"],
    ["tailpipeTHC", "THC [g/kWh]"],
    ["tailpipeNO2", "NO2 (NOX,NO - Tailpipe) [g/kWh]"],
    ["tailpipeNOX", "NOX [g/kWh]"],
    ["tailpipeNO", "NO [g/kWh]"],
    ["tailpipeO2", "O2 [g/kWh]"],
  ] as const;
  const tailpipeRecords = s.cyclicRecords.filter((record) =>
    tailpipeKeys.some(([key]) => Boolean(record.values[key])),
  );
  if (tailpipeRecords.length) {
    blocks.push({ type: "heading", text: "Tailpipe (EBH02) bench results — not driftcorrected · Specific results Phase 1" });
    blocks.push({
      type: "table",
      head: ["Source PDF", ...tailpipeKeys.map(([, label]) => label)],
      body: tailpipeRecords.map((record) => [
        record.source,
        ...tailpipeKeys.map(([key]) => record.values[key] ?? ""),
      ]),
      small: true,
    });
  }
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
    const base = requested.split("").map((char) => "[]:*?/\\\\".includes(char) ? " " : char).join("").trim().slice(0, 31) || "Sheet";
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

export function exportCyclicWorkbook(s: S) {
  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, rows: unknown[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws["!cols"] = widths.map((wch) => ({ wch }));
    if (rows.length > 2 && rows[2]?.length) {
      ws["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(rows[2].length - 1)}${rows.length}` };
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // Cover sheet follows the report front-page layout: report name, cycle subtitle,
  // then the editable front-page fields configured in the PDF Cyclic Summary module.
  const frontRows: unknown[][] = [
    [s.cyclicFront.title || "Cyclic Emission Summary Report"],
    [`${s.cyclicCycle} Cyclic Emission Results`],
    [],
    ["Report field", "Value"],
    ...visibleFields(s.cyclicFront),
  ];
  addSheet("Front Page", frontRows, [30, 48]);

  const cols = s.cyclicColumns.filter((column) => column.visible);
  const summaryRows: unknown[][] = [
    [`${s.cyclicCycle} Cyclic Emission Results`],
    [`Units: ${s.cyclicUnits || "as shown in source report"}`],
    cols.map((column) => column.label),
    ...s.cyclicRecords.map((record, index) =>
      cols.map((column) => column.key === "sn" ? record.values.sn || String(index + 1) : record.values[column.key] ?? ""),
    ),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = cols.map((column) => ({ wch: Math.max(14, Math.min(32, column.label.length + 4)) }));
  if (s.cyclicRecords.length) summarySheet["!autofilter"] = {
    ref: `A3:${XLSX.utils.encode_col(Math.max(0, cols.length - 1))}${summaryRows.length}`,
  };
  XLSX.utils.book_append_sheet(wb, summarySheet, "Cyclic Summary");

  const engineOutKeys = [
    ["engineOutCH4", "CH4 [g/kWh]"],
    ["engineOutCO2", "CO2 [g/kWh]"],
    ["engineOutCOH", "COH [g/kWh]"],
    ["engineOutCO", "CO (COH - EngineOut) [g/kWh]"],
    ["engineOutTHC", "THC [g/kWh]"],
    ["engineOutNO2", "NO2 (NOX,NO - EngineOut) [g/kWh]"],
    ["engineOutNOX", "NOX [g/kWh]"],
    ["engineOutNO", "NO [g/kWh]"],
    ["engineOutO2", "O2 [g/kWh]"],
  ] as const;
  const engineOutRecords = s.cyclicRecords.filter((record) =>
    engineOutKeys.some(([key]) => record.values[key] !== undefined && record.values[key] !== ""),
  );
  if (engineOutRecords.length) {
    addSheet("EngineOut EBH01", [
      ["EngineOut (EBH01) bench results — not driftcorrected · Specific results Phase 1"],
      [],
      ["Source PDF", "Test ID", "Date", ...engineOutKeys.map(([, label]) => label)],
      ...engineOutRecords.map((record) => [
        record.source, record.values.testId ?? "", record.values.date ?? "",
        ...engineOutKeys.map(([key]) => record.values[key] ?? ""),
      ]),
    ], [42, 20, 16, ...engineOutKeys.map(() => 22)]);
  }

  const tailpipeKeys = [
    ["tailpipeCH4", "CH4 [g/kWh]"],
    ["tailpipeCO2", "CO2 [g/kWh]"],
    ["tailpipeCOL", "COL [g/kWh]"],
    ["tailpipeCO", "CO (COL - Tailpipe) [g/kWh]"],
    ["tailpipeTHC", "THC [g/kWh]"],
    ["tailpipeNO2", "NO2 (NOX,NO - Tailpipe) [g/kWh]"],
    ["tailpipeNOX", "NOX [g/kWh]"],
    ["tailpipeNO", "NO [g/kWh]"],
    ["tailpipeO2", "O2 [g/kWh]"],
  ] as const;
  const tailpipeRecords = s.cyclicRecords.filter((record) =>
    tailpipeKeys.some(([key]) => record.values[key] !== undefined && record.values[key] !== ""),
  );
  if (tailpipeRecords.length) {
    addSheet("Tailpipe EBH02", [
      ["Tailpipe (EBH02) bench results — not driftcorrected · Specific results Phase 1"],
      [],
      ["Source PDF", "Test ID", "Date", ...tailpipeKeys.map(([, label]) => label)],
      ...tailpipeRecords.map((record) => [
        record.source, record.values.testId ?? "", record.values.date ?? "",
        ...tailpipeKeys.map(([key]) => record.values[key] ?? ""),
      ]),
    ], [42, 20, 16, ...tailpipeKeys.map(() => 22)]);
  }

  addSheet("Extraction Review", [
    ["S. No.", "Source PDF", "Status", "Notes / remarks", "Raw extracted section"],
    ...s.cyclicRecords.map((record, index) => [
      String(index + 1), record.source, record.status, record.message, record.sectionText,
    ]),
  ], [10, 42, 16, 70, 100]);

  XLSX.writeFile(wb, `${s.cyclicCycle}_cyclic_emission_summary.xlsx`);
}
