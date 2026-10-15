import { create } from "zustand";
import { buildTable, type Cell } from "./parse";

export type Cycle = "FTP" | "NRTC" | "NRSC" | "RMC";
export type DataType = "triggered" | "1hz";

export interface Dataset {
  id: string;
  name: string;
  fileName: string;
  version: number;
  loadedAt: string;
  sheets: Record<string, Cell[][]>;
  sheet: string;
  headerRow: number;
  unitsRow: number;
  headers: string[];
  rows: Cell[][];
}

export interface TraceStyle {
  color?: string;
  width?: number;
  dash?: "solid" | "dash" | "dot" | "dashdot";
  label?: string;
}

export interface GraphConfig {
  id: string;
  title: string;
  subtitle: string;
  xCol: string;
  yCols: string[];
  datasetIds: string[];
  xLabel: string;
  yLabel: string;
  legend: "top" | "bottom" | "right" | "left";
  mode: "lines" | "markers" | "lines+markers";
  styles: Record<string, TraceStyle>;
  hidden: string[];
  rangeMin: string;
  rangeMax: string;
  showDiff: boolean;
  diffMode: "abs" | "pct";
  refId: string;
  align: "exact" | "interp";
}

export interface FrontField {
  id: string;
  label: string;
  value: string;
  hidden: boolean;
  custom?: boolean;
  required?: boolean;
}

export interface FrontPage {
  title: string;
  logo: string;
  fields: FrontField[];
}

export interface FtpFront {
  date: string;
  engineModel: string;
  ftpFileName: string;
}

export type CyclicCycle = "NRTC" | "NRSC" | "RMC";

export interface CyclicColumn {
  key: string;
  label: string;
  visible: boolean;
}

export interface CyclicRecord {
  id: string;
  source: string;
  status: "extracted" | "review" | "no-text" | "error";
  message: string;
  sectionText: string;
  values: Record<string, string>;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10);

export function defaultFront(title: string, cycle: string): FrontPage {
  const f = (label: string, value = "", required = false): FrontField => ({
    id: uid(),
    label,
    value,
    hidden: false,
    required,
  });
  return {
    title,
    logo: "",
    fields: [
      f("Date", today(), true),
      f("Engine Model"),
      f("Engine Number"),
      f("Test Cycle", cycle),
      f("Test ID"),
      f("Test Name"),
      f("Project Name"),
      f("Test File Name"),
      f("Prepared By"),
    ],
  };
}

export const DEFAULT_CYCLIC_COLUMNS: CyclicColumn[] = [
  { key: "sn", label: "S. No.", visible: true },
  { key: "date", label: "Date", visible: true },
  { key: "testId", label: "Test ID", visible: true },
  { key: "testName", label: "Test Name", visible: true },
  { key: "engine", label: "Engine Model / No.", visible: true },
  { key: "noxThc", label: "NOx+THC", visible: false },
  { key: "nox", label: "NOx", visible: true },
  { key: "hc", label: "THC / HC", visible: true },
  { key: "co", label: "CO", visible: true },
  { key: "pm", label: "PM", visible: true },
  { key: "pn", label: "PN", visible: true },
  { key: "limits", label: "Applicable Limits", visible: true },
  { key: "result", label: "Pass / Fail", visible: true },
  { key: "remarks", label: "Remarks", visible: true },
];

interface State {
  cycle: Cycle;
  dataType: DataType;
  datasets: Dataset[];
  graphs: GraphConfig[];
  activeGraph: string;
  ftpFront: FtpFront;
  compareFront: FrontPage;
  includeStats: boolean;
  includeTables: boolean;
  cyclicCycle: CyclicCycle;
  cyclicFront: FrontPage;
  cyclicColumns: CyclicColumn[];
  cyclicRecords: CyclicRecord[];
  cyclicUnits: string;
  set: (p: Partial<State>) => void;
  addDataset: (fileName: string, sheets: Record<string, Cell[][]>) => void;
  updateDataset: (id: string, p: Partial<Dataset>) => void;
  reparse: (id: string, p: { sheet?: string; headerRow?: number; unitsRow?: number }) => void;
  replaceDataset: (id: string, fileName: string, sheets: Record<string, Cell[][]>) => string[];
  removeDataset: (id: string) => void;
  addGraph: () => void;
  updateGraph: (id: string, p: Partial<GraphConfig>) => void;
  removeGraph: (id: string) => void;
  duplicateGraph: (id: string) => void;
}

export function newGraph(n: number, datasets: Dataset[]): GraphConfig {
  return {
    id: uid(),
    title: `Graph ${n}`,
    subtitle: "",
    xCol: datasets[0]?.headers[0] ?? "",
    yCols: [],
    datasetIds: datasets.map((d) => d.id),
    xLabel: "",
    yLabel: "",
    legend: "bottom",
    mode: "lines",
    styles: {},
    hidden: [],
    rangeMin: "",
    rangeMax: "",
    showDiff: false,
    diffMode: "abs",
    refId: datasets[0]?.id ?? "",
    align: "exact",
  };
}

export const useApp = create<State>((setState, get) => ({
  cycle: "NRTC",
  dataType: "1hz",
  datasets: [],
  graphs: [],
  activeGraph: "",
  ftpFront: { date: today(), engineModel: "", ftpFileName: "" },
  compareFront: defaultFront("Engine Test Data Comparison Report", "NRTC"),
  includeStats: true,
  includeTables: false,
  cyclicCycle: "NRTC",
  cyclicFront: defaultFront("Cyclic Emission Summary Report", "NRTC"),
  cyclicColumns: DEFAULT_CYCLIC_COLUMNS,
  cyclicRecords: [],
  cyclicUnits: "g/kWh (PN: #/kWh)",
  set: (p) => setState(p),
  addDataset: (fileName, sheets) => {
    const sheet = Object.keys(sheets)[0];
    const t = buildTable(sheets[sheet], 1, 0);
    const ds: Dataset = {
      id: uid(),
      name: fileName.replace(/\.[^.]+$/, ""),
      fileName,
      version: 1,
      loadedAt: new Date().toLocaleString(),
      sheets,
      sheet,
      headerRow: 1,
      unitsRow: 0,
      ...t,
    };
    setState((s) => ({
      datasets: [...s.datasets, ds],
      graphs: s.graphs.map((g) => ({ ...g, datasetIds: [...g.datasetIds, ds.id], refId: g.refId || ds.id })),
    }));
  },
  updateDataset: (id, p) =>
    setState((s) => ({ datasets: s.datasets.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
  reparse: (id, p) =>
    setState((s) => ({
      datasets: s.datasets.map((d) => {
        if (d.id !== id) return d;
        const n = { ...d, ...p };
        return { ...n, ...buildTable(n.sheets[n.sheet] ?? [], n.headerRow, n.unitsRow) };
      }),
    })),
  replaceDataset: (id, fileName, sheets) => {
    const d = get().datasets.find((x) => x.id === id);
    if (!d) throw new Error("Dataset not found");
    const sheet = sheets[d.sheet] ? d.sheet : Object.keys(sheets)[0];
    const t = buildTable(sheets[sheet], d.headerRow, d.unitsRow);
    if (!t.rows.length) throw new Error("Replacement file has no data rows under the selected header row.");
    const realHeaders = t.headers.filter((h) => !/^Column \d+$/.test(h));
    if (!realHeaders.length) throw new Error("No column headers detected in the replacement file.");
    const used = new Set<string>();
    get().graphs.forEach((g) => {
      if (g.datasetIds.includes(id)) [g.xCol, ...g.yCols].forEach((c) => c && used.add(c));
    });
    const missing = [...used].filter((c) => !t.headers.includes(c));
    setState((s) => ({
      datasets: s.datasets.map((x) =>
        x.id === id
          ? { ...x, fileName, sheets, sheet, ...t, version: x.version + 1, loadedAt: new Date().toLocaleString() }
          : x,
      ),
    }));
    return missing;
  },
  removeDataset: (id) =>
    setState((s) => ({
      datasets: s.datasets.filter((d) => d.id !== id),
      graphs: s.graphs.map((g) => ({
        ...g,
        datasetIds: g.datasetIds.filter((x) => x !== id),
        refId: g.refId === id ? s.datasets.find((d) => d.id !== id)?.id ?? "" : g.refId,
      })),
    })),
  addGraph: () => {
    const g = newGraph(get().graphs.length + 1, get().datasets);
    setState((s) => ({ graphs: [...s.graphs, g], activeGraph: g.id }));
  },
  updateGraph: (id, p) =>
    setState((s) => ({ graphs: s.graphs.map((g) => (g.id === id ? { ...g, ...p } : g)) })),
  removeGraph: (id) =>
    setState((s) => {
      const graphs = s.graphs.filter((g) => g.id !== id);
      return { graphs, activeGraph: s.activeGraph === id ? graphs[0]?.id ?? "" : s.activeGraph };
    }),
  duplicateGraph: (id) => {
    const g = get().graphs.find((x) => x.id === id);
    if (!g) return;
    const c = { ...structuredClone(g), id: uid(), title: g.title + " (copy)" };
    setState((s) => ({ graphs: [...s.graphs, c], activeGraph: c.id }));
  },
}));
