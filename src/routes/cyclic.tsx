import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useApp, uid, type CyclicCycle } from "@/lib/store";
import { extractPdf } from "@/lib/pdfExtract";
import { Btn, Inp, PageHeader, Panel, Segmented, Field } from "@/components/kit";
import { FrontEditor } from "@/components/FrontPageEditor";

export const Route = createFileRoute("/cyclic")({
  head: () => ({
    meta: [
      { title: "PDF Cyclic Emission Summary — EngineLab" },
      { name: "description", content: "Extract NRTC, NRSC and RMC cyclic emission results from report PDFs." },
      { property: "og:title", content: "PDF Cyclic Emission Summary — EngineLab" },
      { property: "og:description", content: "Extract NRTC, NRSC and RMC cyclic emission results from report PDFs." },
    ],
  }),
  component: Cyclic,
});

function Cyclic() {
  const s = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState("");
  const cols = s.cyclicColumns;
  const setVal = (id: string, k: string, v: string) =>
    s.set({ cyclicRecords: s.cyclicRecords.map((r) => (r.id === id ? { ...r, values: { ...r.values, [k]: v } } : r)) });

  const onFiles = async (files: FileList | null) => {
    setBusy(true);
    const out = [];
    for (const f of Array.from(files ?? [])) out.push(await extractPdf(f, s.cyclicCycle));
    s.set({ cyclicRecords: [...useApp.getState().cyclicRecords, ...out] });
    setBusy(false);
    toast.success(`${out.length} PDF(s) processed — review the values below.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="PDF Cyclic Emission Summary" desc="Independent module. Values are never invented — blank means not found." actions={<Link to="/report" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Preview report</Link>} />
      <Panel title="1 · Test cycle">
        <Segmented value={s.cyclicCycle} onChange={(c: CyclicCycle) => s.set({ cyclicCycle: c })} options={(["NRTC", "NRSC", "RMC"] as const).map((v) => ({ value: v, label: v }))} />
      </Panel>
      <Panel title="2 · Emission report PDFs" actions={<>
        <input ref={ref} type="file" multiple accept="application/pdf" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <Btn variant="primary" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Extracting…" : "+ Upload PDFs"}</Btn>
        <Btn onClick={() => s.set({ cyclicRecords: [...s.cyclicRecords, { id: uid(), source: "(manual entry)", status: "review", message: "Entered manually", sectionText: "", values: {} }] })}>+ Manual row</Btn>
      </>}>
        <p className="text-xs text-muted-foreground">Searches for "Emission limits - Stage V NRE" and reads CO, NOx, HC, NOx+THC, PM, PN, limits, Pass/Fail and remarks. Scanned PDFs without text are flagged (OCR not available).</p>
      </Panel>
      <Panel title="3 · Review & correct summary table" actions={<Field label="Units"><Inp value={s.cyclicUnits} onChange={(e) => s.set({ cyclicUnits: e.target.value })} /></Field>}>
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {cols.map((c) => (
            <label key={c.key} className="flex items-center gap-1">
              <input type="checkbox" checked={c.visible} onChange={(e) => s.set({ cyclicColumns: cols.map((x) => (x.key === c.key ? { ...x, visible: e.target.checked } : x)) })} />
              <Inp className="h-6 w-28 text-xs" value={c.label} onChange={(e) => s.set({ cyclicColumns: cols.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)) })} />
            </label>
          ))}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-muted text-left">{cols.filter((c) => c.visible).map((c) => <th key={c.key} className="px-1 py-1">{c.label}</th>)}<th>Source / status</th><th /></tr></thead>
            <tbody>
              {s.cyclicRecords.map((r, i) => (<>
                <tr key={r.id} className="border-t align-top">
                  {cols.filter((c) => c.visible).map((c) => (
                    <td key={c.key} className="p-0.5">
                      <Inp className={`h-7 w-full min-w-16 text-xs ${!r.values[c.key] && c.key !== "sn" ? "bg-warning/40" : ""}`} value={c.key === "sn" ? r.values.sn ?? String(i + 1) : r.values[c.key] ?? ""} onChange={(e) => setVal(r.id, c.key, e.target.value)} />
                    </td>
                  ))}
                  <td className="p-1"><div className="font-mono">{r.source}</div><span className={r.status === "extracted" ? "text-success" : "text-destructive"}>{r.status}</span></td>
                  <td className="whitespace-nowrap p-1">
                    <button className="text-primary" onClick={() => setOpen(open === r.id ? "" : r.id)}>Details</button>{" · "}
                    <button className="text-destructive" onClick={() => s.set({ cyclicRecords: s.cyclicRecords.filter((x) => x.id !== r.id) })}>Remove</button>
                  </td>
                </tr>
                {open === r.id && <tr key={r.id + "d"}><td colSpan={99} className="bg-muted p-2"><p className="mb-1">{r.message}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{r.sectionText || "(no section text)"}</pre></td></tr>}
              </>))}
            </tbody>
          </table>
          {!s.cyclicRecords.length && <p className="py-4 text-sm text-muted-foreground">No records yet.</p>}
        </div>
      </Panel>
      <Panel title="4 · Report front page">
        <FrontEditor value={s.cyclicFront} onChange={(cyclicFront) => s.set({ cyclicFront })} />
      </Panel>
    </div>
  );
}
