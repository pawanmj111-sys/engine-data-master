import { useRef, useState } from "react";
import { toast } from "sonner";
import { readFileSheets } from "@/lib/parse";
import { useApp, type Dataset } from "@/lib/store";
import { Btn, Field, Inp, Sel } from "./kit";

export function useReplace() {
  const replaceDataset = useApp((s) => s.replaceDataset);
  return async (d: Dataset, f: File) => {
    try {
      const sheets = await readFileSheets(f);
      const missing = replaceDataset(d.id, f.name, sheets);
      toast.success(`"${d.name}" updated to v${d.version + 1} from ${f.name}`);
      if (missing.length) toast.warning(`Missing in new file: ${missing.join(", ")}. Select replacement parameters.`);
    } catch (e) {
      toast.error(`Replacement rejected, previous data kept: ${(e as Error).message}`);
    }
  };
}

export function ReplaceButton({ d }: { d: Dataset }) {
  const ref = useRef<HTMLInputElement>(null);
  const replace = useReplace();
  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(d, f); e.target.value = ""; }} />
      <Btn onClick={() => ref.current?.click()}>Replace Excel File</Btn>
    </>
  );
}

export function DatasetRow({ d }: { d: Dataset }) {
  const { updateDataset, reparse, removeDataset } = useApp();
  const [preview, setPreview] = useState(false);
  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Display name"><Inp value={d.name} onChange={(e) => updateDataset(d.id, { name: e.target.value })} /></Field>
        <Field label="Worksheet">
          <Sel value={d.sheet} onChange={(e) => reparse(d.id, { sheet: e.target.value })}>
            {Object.keys(d.sheets).map((s) => <option key={s}>{s}</option>)}
          </Sel>
        </Field>
        <Field label="Header row"><Inp type="number" min={1} className="w-20" value={d.headerRow} onChange={(e) => reparse(d.id, { headerRow: Math.max(1, +e.target.value) })} /></Field>
        <Field label="Units row (0 = none)"><Inp type="number" min={0} className="w-24" value={d.unitsRow} onChange={(e) => reparse(d.id, { unitsRow: Math.max(0, +e.target.value) })} /></Field>
        <div className="font-mono text-xs text-muted-foreground">{d.fileName} · <b className="text-primary">v{d.version}</b> · {d.rows.length} rows · {d.headers.length} cols</div>
        <div className="ml-auto flex gap-2">
          <Btn onClick={() => setPreview(!preview)}>{preview ? "Hide" : "Preview"}</Btn>
          <ReplaceButton d={d} />
          <Btn variant="danger" onClick={() => removeDataset(d.id)}>Remove</Btn>
        </div>
      </div>
      {preview && (
        <div className="mt-3 max-h-72 overflow-auto rounded border">
          <table className="font-mono text-xs">
            <thead className="sticky top-0 bg-muted"><tr>{d.headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>{d.rows.slice(0, 30).map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-0.5">{c ?? ""}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
