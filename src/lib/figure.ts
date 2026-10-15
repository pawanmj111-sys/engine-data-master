import * as XLSX from "xlsx";
import { analyzeGraph, stats, type GraphAnalysis } from "./analysis";
import type { Dataset, GraphConfig, TraceStyle } from "./store";

export const PALETTE = ["#1f5fa8", "#d1495b", "#2a9d5c", "#e08e0b", "#6a4c93", "#0f8b8d", "#8c564b", "#c2185b", "#455a64", "#7cb342"];
const DASHES: TraceStyle["dash"][] = ["solid", "dash", "dot", "dashdot"];

export function traceStyle(g: GraphConfig, datasets: Dataset[], key: string) {
  const [dsId, col] = key.split("::");
  const di = Math.max(0, g.datasetIds.indexOf(dsId));
  const ci = Math.max(0, g.yCols.indexOf(col));
  const ds = datasets.find((d) => d.id === dsId);
  const s = g.styles[key] ?? {};
  return {
    color: s.color ?? PALETTE[(di + ci * 3) % PALETTE.length],
    width: s.width ?? 2,
    dash: s.dash ?? DASHES[ci % DASHES.length],
    label: s.label || `${ds?.name ?? "?"} — ${col}`,
  };
}

const LEGEND = {
  top: { orientation: "h", x: 0, y: 1.12, xanchor: "left" },
  bottom: { orientation: "h", x: 0, y: -0.18, xanchor: "left", yanchor: "top" },
  right: { orientation: "v", x: 1.02, y: 1 },
  left: { orientation: "v", x: -0.2, y: 1, xanchor: "right" },
};

export function buildFigure(g: GraphConfig, datasets: Dataset[], dataType: "triggered" | "1hz", large = false) {
  const a = analyzeGraph(g, datasets, dataType);
  const fs = large ? 18 : 12;
  const data: object[] = [];
  for (const s of a.series) {
    if (g.hidden.includes(s.key) || g.hidden.includes(s.dsId) || g.hidden.includes(`col::${s.col}`)) continue;
    const st = traceStyle(g, datasets, s.key);
    data.push({
      type: "scattergl",
      mode: g.mode,
      name: st.label,
      x: s.x,
      y: s.y,
      line: { color: st.color, width: st.width, dash: st.dash },
      marker: { color: st.color, size: large ? 8 : 6 },
      connectgaps: false,
      hovertemplate: `%{x}<br>%{y}<extra>${st.label}</extra>`,
    });
  }
  for (const d of a.diffs) {
    const st = traceStyle(g, datasets, d.key.replace("diff::", ""));
    data.push({
      type: "scattergl",
      mode: dataType === "triggered" ? "lines+markers" : "lines",
      name: `Δ${g.diffMode === "pct" ? "%" : ""} ${d.label}`,
      x: d.x,
      y: d.y,
      yaxis: "y2",
      line: { color: st.color, width: 1.5, dash: "dot" },
      connectgaps: false,
    });
  }
  const showDiff = g.showDiff && a.diffs.length > 0;
  const titleText = g.subtitle
    ? `<b>${g.title}</b><br><span style="font-size:${fs - 2}px">${g.subtitle}</span>`
    : `<b>${g.title}</b>`;
  const lo = g.rangeMin.trim() ? Number(g.rangeMin) : undefined;
  const hi = g.rangeMax.trim() ? Number(g.rangeMax) : undefined;
  const layout: Record<string, unknown> = {
    title: { text: titleText, font: { size: fs + 6 }, x: 0.02, xanchor: "left" },
    font: { family: "IBM Plex Sans, Arial, sans-serif", size: fs, color: "#1e293b" },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    margin: { l: 80, r: g.legend === "right" ? 20 : 30, t: g.subtitle ? 90 : 70, b: g.legend === "bottom" ? 120 : 70 },
    legend: { ...LEGEND[g.legend], font: { size: fs } },
    hovermode: "closest",
    dragmode: "zoom",
    xaxis: {
      title: { text: g.xLabel || g.xCol },
      gridcolor: "#e2e8f0",
      zeroline: false,
      showline: true,
      linecolor: "#94a3b8",
      type: dataType === "triggered" ? "category" : "linear",
      ...(lo !== undefined && hi !== undefined && dataType !== "triggered" ? { range: [lo, hi] } : {}),
    },
    yaxis: {
      title: { text: g.yLabel || (g.yCols.length === 1 ? g.yCols[0] : "Value") },
      gridcolor: "#e2e8f0",
      showline: true,
      linecolor: "#94a3b8",
      domain: showDiff ? [0.38, 1] : [0, 1],
    },
  };
  if (showDiff)
    layout.yaxis2 = {
      title: { text: g.diffMode === "pct" ? "Deviation [%]" : "Difference" },
      domain: [0, 0.3],
      anchor: "x",
      gridcolor: "#e2e8f0",
      showline: true,
      linecolor: "#94a3b8",
      zeroline: true,
      zerolinecolor: "#64748b",
    };
  return { data, layout, analysis: a };
}

export function statsRows(a: GraphAnalysis, g: GraphConfig, datasets: Dataset[]) {
  const rows: string[][] = [];
  for (const s of a.series) {
    const st = stats(s.y);
    rows.push([traceStyle(g, datasets, s.key).label, String(st.n), n(st.min), n(st.max), n(st.mean), n(st.std)]);
  }
  for (const d of a.diffs) {
    const st = stats(d.y);
    rows.push([`Δ${g.diffMode === "pct" ? "%" : ""} ${d.label}`, String(st.n), n(st.min), n(st.max), n(st.mean), n(st.std)]);
  }
  return rows;
}
const n = (v: number | null) => (v === null ? "n/a" : Number(v.toPrecision(6)).toString());
export const STATS_HEAD = ["Series", "N", "Min", "Max", "Mean", "Std dev"];

export function plottedAoa(a: GraphAnalysis, g: GraphConfig, datasets: Dataset[]) {
  const cols: { name: string; vals: unknown[] }[] = [];
  for (const s of a.series) {
    const lbl = traceStyle(g, datasets, s.key).label;
    cols.push({ name: `${lbl} | X: ${g.xCol}`, vals: s.x }, { name: lbl, vals: s.y });
  }
  for (const d of a.diffs) {
    cols.push({ name: `Δ ${d.label} | X`, vals: d.x }, { name: `Δ${g.diffMode === "pct" ? "%" : ""} ${d.label}`, vals: d.y });
  }
  const len = Math.max(0, ...cols.map((c) => c.vals.length));
  const aoa: unknown[][] = [cols.map((c) => c.name)];
  for (let i = 0; i < len; i++) aoa.push(cols.map((c) => c.vals[i] ?? null));
  return aoa;
}

export function exportGraphData(a: GraphAnalysis, g: GraphConfig, datasets: Dataset[], kind: "xlsx" | "csv") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plottedAoa(a, g, datasets)), "Plotted data");
  if (kind === "xlsx") {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([STATS_HEAD, ...statsRows(a, g, datasets)]), "Statistics");
    if (a.diffs.length)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Difference", "Alignment method"], ...a.diffs.map((d) => [d.label, d.note])]), "Alignment");
  }
  XLSX.writeFile(wb, `${safe(g.title)}.${kind}`, { bookType: kind });
}

export const safe = (s: string) => s.replace(/[^\w\- ]+/g, "_").trim() || "graph";

let plotlyP: Promise<any> | null = null;
export function loadPlotly() {
  if (!plotlyP) plotlyP = import("plotly.js-dist-min").then((m) => m.default ?? m);
  return plotlyP;
}

export async function figureToPng(fig: { data: object[]; layout: object }, width = 1400, height = 700) {
  const Plotly = await loadPlotly();
  const data = fig.data.map((t: any) => ({ ...t, type: "scatter" }));
  return (await Plotly.toImage({ data, layout: fig.layout }, { format: "png", width, height, scale: 1.5 })) as string;
}
