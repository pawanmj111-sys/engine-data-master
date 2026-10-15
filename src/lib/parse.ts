import * as XLSX from "xlsx";

export type Cell = string | number | null;

export async function readFileSheets(file: File): Promise<Record<string, Cell[][]>> {
  const name = file.name.toLowerCase();
  if (!/\.(xlsx|xlsm|xls|csv)$/.test(name)) {
    throw new Error("Unsupported file type. Use .xlsx, .xlsm, .xls or .csv.");
  }
  const buf = await file.arrayBuffer();
  const wb = name.endsWith(".csv")
    ? XLSX.read(new TextDecoder().decode(buf), { type: "string" })
    : XLSX.read(buf, { type: "array" });
  const out: Record<string, Cell[][]> = {};
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sn], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }) as Cell[][];
    while (aoa.length && aoa[aoa.length - 1].every((c) => c === null || c === "")) aoa.pop();
    out[sn] = aoa;
  }
  if (!Object.keys(out).length) throw new Error("The workbook contains no sheets.");
  return out;
}

const NUM_RE = /^\s*[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?\s*$/;

export function normCell(c: unknown): Cell {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (typeof c === "boolean") return c ? 1 : 0;
  if (c instanceof Date) return c.getTime();
  const s = String(c);
  if (NUM_RE.test(s)) return Number(s.replace(",", "."));
  return s;
}

export function buildTable(aoa: Cell[][], headerRow: number, unitsRow: number) {
  const hr = Math.max(1, headerRow);
  const rawHead = aoa[hr - 1] ?? [];
  const units = unitsRow > 0 ? aoa[unitsRow - 1] ?? [] : [];
  const width = Math.max(rawHead.length, ...aoa.slice(hr, hr + 50).map((r) => r.length), 0);
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let i = 0; i < width; i++) {
    let h = rawHead[i] == null || String(rawHead[i]).trim() === "" ? `Column ${i + 1}` : String(rawHead[i]).trim();
    const u = units[i];
    if (u != null && String(u).trim() && !unitOf(h)) h = `${h} [${String(u).trim()}]`;
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    headers.push(n ? `${h} (${n + 1})` : h);
  }
  const start = Math.max(hr, unitsRow);
  const rows = aoa.slice(start).map((r) => headers.map((_, i) => normCell(r[i])));
  return { headers, rows };
}

export function unitOf(header: string): string | null {
  const m = header.match(/[[(]([^\])[(]+)[\])]\s*$/);
  return m ? m[1].trim() : null;
}

export function toNum(c: Cell): number | null {
  return typeof c === "number" && Number.isFinite(c) ? c : null;
}
