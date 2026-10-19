import { toNum, unitOf, type Cell } from "./parse";
import type { Dataset, GraphConfig } from "./store";

export interface Series {
  key: string;
  dsId: string;
  dsName: string;
  col: string;
  x: Cell[];
  y: (number | null)[];
}

export interface Stats {
  n: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  std: number | null;
}

export function stats(y: (number | null)[]): Stats {
  const v = y.filter((a): a is number => a !== null && Number.isFinite(a));
  if (!v.length) return { n: 0, min: null, max: null, mean: null, std: null };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const a of v) { if (a < min) min = a; if (a > max) max = a; sum += a; }
  const mean = sum / v.length;
  const std = v.length > 1 ? Math.sqrt(v.reduce((s, a) => s + (a - mean) ** 2, 0) / (v.length - 1)) : null;
  return { n: v.length, min, max, mean, std };
}

function inRange(x: Cell, lo: number | null, hi: number | null) {
  if (lo === null && hi === null) return true;
  const n = toNum(x);
  if (n === null) return false;
  return (lo === null || n >= lo) && (hi === null || n <= hi);
}

export type ParameterAliases = Record<string, string[]>;

function normalizeParameterName(value: string): string {
  return value
    .trim()
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLocaleLowerCase()
    .replace(/[\s_\-./\\]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function resolveParameterHeader(
  ds: Dataset,
  selected: string,
  aliases: ParameterAliases = {},
): string | null {
  if (!selected.trim()) return null;

  // Keep an exact match first so unit-qualified or similarly named parameters
  // stay distinct when the user selected their full header.
  if (ds.headers.includes(selected)) return selected;

  const selectedNorm = normalizeParameterName(selected);
  const entry = Object.entries(aliases).find(([canonical, names]) =>
    normalizeParameterName(canonical) === selectedNorm ||
    names.some((name) => normalizeParameterName(name) === selectedNorm)
  );
  const candidates = entry ? [...new Set([entry[0], ...entry[1], selected])] : [selected];

  // Match case/spacing variations first, then allow unit suffixes to differ.
  for (const candidate of candidates) {
    const exactNormalized = ds.headers.find((header) =>
      header.trim().toLocaleLowerCase() === candidate.trim().toLocaleLowerCase()
    );
    if (exactNormalized) return exactNormalized;
  }
  for (const candidate of candidates) {
    const normalized = normalizeParameterName(candidate);
    if (!normalized) continue;
    const match = ds.headers.find((header) => normalizeParameterName(header) === normalized);
    if (match) return match;
  }
  return null;
}

export function getSeries(ds: Dataset, g: GraphConfig, col: string, aliases: ParameterAliases = {}): Series | null {
  const xHeader = resolveParameterHeader(ds, g.xCol, aliases);
  const yHeader = resolveParameterHeader(ds, col, aliases);
  if (!xHeader || !yHeader) return null;
  const xi = ds.headers.indexOf(xHeader);
  const yi = ds.headers.indexOf(yHeader);
  if (xi < 0 || yi < 0) return null;
  const lo = g.rangeMin.trim() === "" ? null : Number(g.rangeMin);
  const hi = g.rangeMax.trim() === "" ? null : Number(g.rangeMax);
  const x: Cell[] = [], y: (number | null)[] = [];
  for (const r of ds.rows) {
    if (!inRange(r[xi], Number.isFinite(lo!) ? lo : null, Number.isFinite(hi!) ? hi : null)) continue;
    x.push(typeof r[xi] === "string" ? (r[xi] as string).trim() : r[xi]);
    y.push(toNum(r[yi]));
  }
  return { key: `${ds.id}::${col}`, dsId: ds.id, dsName: ds.name, col, x, y };
}

export interface TimeCheck {
  missing: number;
  duplicates: number;
  nonMonotonic: number;
  gaps: number;
  nonNumeric: number;
  medianStep: number | null;
}

export function checkTime(x: Cell[]): TimeCheck {
  let missing = 0, nonNumeric = 0, duplicates = 0, nonMonotonic = 0, gaps = 0;
  const nums: number[] = [];
  for (const c of x) {
    if (c === null) missing++;
    else if (typeof c !== "number") nonNumeric++;
    else nums.push(c);
  }
  const steps: number[] = [];
  for (let i = 1; i < nums.length; i++) {
    const d = nums[i] - nums[i - 1];
    if (d === 0) duplicates++;
    else if (d < 0) nonMonotonic++;
    else steps.push(d);
  }
  const sorted = [...steps].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  if (med) gaps = steps.filter((d) => d > med * 1.5).length;
  return { missing, duplicates, nonMonotonic, gaps, nonNumeric, medianStep: med };
}

export interface DiffResult {
  key: string;
  label: string;
  x: Cell[];
  y: (number | null)[];
  matched: number;
  unmatched: number;
  zeroRef: number;
  note: string;
}

export function diffSeries(
  ref: Series,
  other: Series,
  mode: "abs" | "pct",
  align: "exact" | "interp",
): DiffResult {
  const out: DiffResult = {
    key: `diff::${other.key}`,
    label: `${other.dsName} − ${ref.dsName} : ${other.col}`,
    x: [], y: [], matched: 0, unmatched: 0, zeroRef: 0, note: "",
  };
  const calc = (o: number | null, r: number | null) => {
    if (o === null || r === null) return null;
    if (mode === "abs") return o - r;
    if (r === 0) { out.zeroRef++; return null; }
    return ((o - r) / Math.abs(r)) * 100;
  };
  if (align === "exact") {
    const map = new Map<string, number | null>();
    let dup = 0;
    ref.x.forEach((k, i) => {
      if (k === null) return;
      const s = String(k);
      if (map.has(s)) dup++; else map.set(s, ref.y[i]);
    });
    other.x.forEach((k, i) => {
      if (k === null || !map.has(String(k))) { out.unmatched++; return; }
      out.matched++;
      out.x.push(k);
      out.y.push(calc(other.y[i], map.get(String(k))!));
    });
    out.note = `Matched on identical X values${dup ? `; ${dup} duplicate reference X values ignored (first used)` : ""}.`;
  } else {
    const pts = ref.x
      .map((k, i) => [toNum(k), ref.y[i]] as const)
      .filter((p): p is [number, number] => p[0] !== null && p[1] !== null)
      .sort((a, b) => a[0] - b[0]);
    other.x.forEach((k, i) => {
      const xv = toNum(k);
      if (xv === null || !pts.length || xv < pts[0][0] || xv > pts[pts.length - 1][0]) { out.unmatched++; return; }
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= xv) lo = m; else hi = m; }
      const [x0, y0] = pts[lo], [x1, y1] = pts[hi];
      const r = x1 === x0 ? y0 : y0 + ((y1 - y0) * (xv - x0)) / (x1 - x0);
      out.matched++;
      out.x.push(xv);
      out.y.push(calc(other.y[i], r));
    });
    out.note = "Reference linearly interpolated onto each dataset's own X values (no resampling of the compared dataset).";
  }
  return out;
}

export interface GraphAnalysis {
  series: Series[];
  diffs: DiffResult[];
  warnings: string[];
}

export function analyzeGraph(g: GraphConfig, datasets: Dataset[], dataType: "triggered" | "1hz", aliases: ParameterAliases = {}): GraphAnalysis {
  const warnings: string[] = [];
  const dss = g.datasetIds.map((id) => datasets.find((d) => d.id === id)).filter(Boolean) as Dataset[];
  const series: Series[] = [];
  if (!g.xCol) warnings.push("Select an X-axis parameter.");
  for (const ds of dss) {
    if (g.xCol && !resolveParameterHeader(ds, g.xCol, aliases))
      warnings.push(`X-axis "${g.xCol}" not found in "${ds.name}" (v${ds.version}). Add a parameter mapping or select a replacement.`);
    else if (g.xCol && resolveParameterHeader(ds, g.xCol, aliases) !== g.xCol)
      warnings.push(`X-axis "${g.xCol}" uses mapped column "${resolveParameterHeader(ds, g.xCol, aliases)}" in "${ds.name}".`);
    for (const col of g.yCols) {
      const resolved = resolveParameterHeader(ds, col, aliases);
      if (!resolved) {
        warnings.push(`Parameter "${col}" not found in "${ds.name}" (v${ds.version}). Add a parameter mapping or select a replacement.`);
        continue;
      }
      if (resolved !== col) warnings.push(`Parameter "${col}" uses mapped column "${resolved}" in "${ds.name}".`);
      const s = getSeries(ds, g, col, aliases);
      if (s) series.push(s);
    }
    if (dataType === "1hz" && g.xCol && resolveParameterHeader(ds, g.xCol, aliases)) {
      const xi = ds.headers.indexOf(resolveParameterHeader(ds, g.xCol, aliases)!);
      const t = checkTime(ds.rows.map((r) => r[xi]));
      const parts: string[] = [];
      if (t.missing) parts.push(`${t.missing} missing timestamps`);
      if (t.nonNumeric) parts.push(`${t.nonNumeric} non-numeric X values`);
      if (t.duplicates) parts.push(`${t.duplicates} duplicate timestamps`);
      if (t.nonMonotonic) parts.push(`${t.nonMonotonic} backward time steps`);
      if (t.gaps) parts.push(`${t.gaps} gaps larger than 1.5× the typical step (${t.medianStep}) — possible missing samples`);
      if (parts.length) warnings.push(`"${ds.name}": ${parts.join(", ")}.`);
    }
  }
  const units = new Set(g.yCols.map((c) => unitOf(c) ?? "(no unit)"));
  if (units.size > 1)
    warnings.push(`Selected Y parameters have different units (${[...units].join(", ")}). They are plotted on the same axis but are not directly comparable.`);
  if (dataType === "1hz" && dss.length > 1) {
    const lens = new Set(dss.map((d) => d.rows.length));
    if (lens.size > 1) warnings.push(`Datasets have different sample counts (${dss.map((d) => `${d.name}: ${d.rows.length}`).join(", ")}). Data are plotted against the X column, never by row number.`);
  }
  const diffs: DiffResult[] = [];
  if (g.showDiff) {
    const align = dataType === "triggered" ? "exact" : g.align;
    for (const col of g.yCols) {
      const ref = series.find((s) => s.dsId === g.refId && s.col === col);
      if (!ref) { warnings.push(`Reference dataset has no data for "${col}"; difference unavailable.`); continue; }
      for (const s of series) {
        if (s.col !== col || s.dsId === g.refId) continue;
        const d = diffSeries(ref, s, g.diffMode, align);
        if (d.zeroRef) warnings.push(`${d.label}: ${d.zeroRef} points have a zero reference value; percentage deviation shown as unavailable.`);
        if (d.unmatched) warnings.push(`${d.label}: ${d.unmatched} points could not be matched to the reference.`);
        diffs.push(d);
      }
    }
  }
  return { series, diffs, warnings };
}

export const fmt = (v: number | null | undefined, d = 4) =>
  v === null || v === undefined || !Number.isFinite(v) ? "n/a" : Number(v.toPrecision(d + 2)).toString();
