import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { buildCompareReport, buildCyclicReport, exportCyclicWorkbook } from "@/lib/builders";
import { exportDocx, exportPdf, type ReportDoc } from "@/lib/report";
import { Btn, PageHeader, Segmented } from "@/components/kit";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report Preview — EngineLab" },
      { name: "description", content: "Preview and export comparison and cyclic emission reports to PDF and Word." },
      { property: "og:title", content: "Report Preview — EngineLab" },
      { property: "og:description", content: "Preview and export comparison and cyclic emission reports to PDF and Word." },
    ],
  }),
  component: Report,
});

function Report() {
  const s = useApp();
  const [kind, setKind] = useState<"compare" | "cyclic">("compare");
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  useEffect(() => {
    let alive = true;
    setDoc(null);
    (kind === "compare" ? buildCompareReport(useApp.getState()) : Promise.resolve(buildCyclicReport(useApp.getState())))
      .then((d) => alive && setDoc(d))
      .catch((e) => toast.error(e.message));
    return () => { alive = false; };
  }, [kind, s]);
  const name = kind === "compare" ? `${s.cycle}_comparison_report` : `${s.cyclicCycle}_cyclic_summary`;

  return (
    <div>
      <PageHeader title="Report Preview" desc="What you see here is exactly what gets exported." actions={<>
        {kind === "cyclic" && <Btn disabled={!doc} onClick={() => {
          try {
            exportCyclicWorkbook(useApp.getState());
            toast.success("Cyclic emission Excel workbook exported.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Excel export failed.");
          }
        }}>Export Excel</Btn>}
        <Btn variant="primary" disabled={!doc} onClick={() => doc && exportPdf(doc, `${name}.pdf`)}>Export PDF</Btn>
        <Btn disabled={!doc} onClick={() => doc && exportDocx(doc, `${name}.docx`)}>Export Word</Btn>
      </>} />
      <div className="mb-4"><Segmented value={kind} onChange={setKind} options={[{ value: "compare", label: "Excel Comparison report" }, { value: "cyclic", label: "PDF Cyclic Summary report" }]} /></div>
      {!doc ? <p className="text-sm text-muted-foreground">Building preview…</p> : (
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="relative aspect-[297/210] border-4 border-double border-primary bg-card p-10">
            {doc.logo && <img src={doc.logo} alt="Logo" className="absolute right-8 top-8 h-14" />}
            <h2 className="mt-12 text-center text-3xl font-bold text-primary">{doc.title}</h2>
            {doc.subtitle && <p className="mt-2 text-center text-muted-foreground">{doc.subtitle}</p>}
            <table className="mx-auto mt-10 w-2/3 text-sm">
              <tbody>{doc.fields.map(([k, v], i) => <tr key={i} className="border"><td className="w-1/3 bg-accent px-3 py-2 font-semibold">{k}</td><td className="px-3 py-2">{v}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="space-y-3 border bg-card p-8">
            {doc.blocks.map((b, i) => {
              if (b.type === "pagebreak") return <hr key={i} className="my-6 border-dashed" />;
              if (b.type === "heading") return <h3 key={i} className="border-b-2 border-primary pb-1 text-lg font-semibold text-primary">{b.text}</h3>;
              if (b.type === "text") return <p key={i} className={`whitespace-pre-wrap ${b.small ? "text-xs" : "text-sm"} text-muted-foreground`}>{b.text}</p>;
              if (b.type === "image") return <figure key={i}><img src={b.src} alt={b.caption ?? "graph"} className="w-full" />{b.caption && <figcaption className="text-center text-xs">{b.caption}</figcaption>}</figure>;
              return (
                <div key={i} className="overflow-auto">
                  <table className="w-full text-xs"><thead><tr className="bg-primary text-primary-foreground">{b.head.map((h, j) => <th key={j} className="px-2 py-1">{h}</th>)}</tr></thead>
                    <tbody>{b.body.map((r, j) => <tr key={j} className="border-t">{r.map((c, k) => <td key={k} className="px-2 py-1">{c}</td>)}</tr>)}</tbody></table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
