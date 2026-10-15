import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { useApp, type GraphConfig } from "@/lib/store";
import { readFileSheets } from "@/lib/parse";
import { buildFigure, exportGraphData, figureToPng, safe, statsRows, STATS_HEAD, traceStyle } from "@/lib/figure";
import { downloadDataUrl } from "@/lib/report";
import { Btn, Field, Inp, PageHeader, Panel, Segmented, Sel, Warnings } from "@/components/kit";
import { DatasetRow } from "@/components/DatasetRow";
import { FrontEditor, FtpFrontEditor } from "@/components/FrontPageEditor";
import { Plot } from "@/components/Plot";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Excel Data Comparison — EngineLab" },
      { name: "description", content: "Upload engine test Excel files and build interactive comparison graphs." },
      { property: "og:title", content: "Excel Data Comparison — EngineLab" },
      { property: "og:description", content: "Upload engine test Excel files and build interactive comparison graphs." },
    ],
  }),
  component: Compare,
});

function Compare() {
  const s = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const allHeaders = useMemo(() => [...new Set(s.datasets.flatMap((d) => d.headers))], [s.datasets]);
  const g = s.graphs.find((x) => x.id === s.activeGraph) ?? s.graphs[0];

  const onFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try { s.addDataset(f.name, await readFileSheets(f)); toast.success(`Loaded ${f.name}`); }
      catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Excel Data Comparison"
        desc="Step-by-step: cycle → data type → files → graphs → report."
        actions={<>
          <Link to="/present" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Preview / Presentation Mode</Link>
          <Link to="/report" className="rounded-md border px-4 py-2 text-sm font-medium">Report Preview</Link>
        </>}
      />
      <Panel title="1 · Test cycle  /  2 · Data type">
        <div className="flex flex-wrap gap-8">
          <Segmented value={s.cycle} onChange={(cycle) => s.set({ cycle })} options={(["FTP", "NRTC", "NRSC", "RMC"] as const).map((v) => ({ value: v, label: v }))} />
          <Segmented value={s.dataType} onChange={(dataType) => s.set({ dataType })} options={[
            { value: "triggered", label: "Triggered Data", hint: "Mode / trigger-point results" },
            { value: "1hz", label: "1 Hz Data", hint: "Time-series, original order kept" },
          ]} />
        </div>
      </Panel>

      <Panel title="3 · Datasets" actions={<>
        <input ref={fileRef} type="file" multiple hidden accept=".xlsx,.xlsm,.xls,.csv" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <Btn variant="primary" onClick={() => fileRef.current?.click()}>+ Upload Excel / CSV</Btn>
      </>}>
        {s.datasets.length === 0 ? <p className="text-sm text-muted-foreground">Upload two or more .xlsx, .xlsm, .xls or .csv files.</p> : (
          <div className="space-y-2">{s.datasets.map((d) => <DatasetRow key={d.id} d={d} />)}</div>
        )}
      </Panel>

      <Panel title="4 · Graphs" actions={<>
        {s.graphs.map((x) => (
          <Btn key={x.id} variant={x.id === g?.id ? "primary" : "default"} onClick={() => s.set({ activeGraph: x.id })}>{x.title}</Btn>
        ))}
        <Btn onClick={s.addGraph} disabled={!s.datasets.length}>+ Add graph</Btn>
      </>}>
        {g ? <GraphEditor g={g} headers={allHeaders} /> : <p className="text-sm text-muted-foreground">Add a graph after uploading datasets.</p>}
      </Panel>

      <Panel title={`Report front page — ${s.cycle}`}>
        {s.cycle === "FTP"
          ? <FtpFrontEditor value={s.ftpFront} onChange={(ftpFront) => s.set({ ftpFront })} />
          : <FrontEditor value={s.compareFront} onChange={(compareFront) => s.set({ compareFront })} />}
        <div className="mt-4 flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.includeStats} onChange={(e) => s.set({ includeStats: e.target.checked })} />Include comparison statistics</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.includeTables} onChange={(e) => s.set({ includeTables: e.target.checked })} />Include detailed result tables</label>
        </div>
      </Panel>
    </div>
  );
}

function GraphEditor({ g, headers }: { g: GraphConfig; headers: string[] }) {
  const s = useApp();
  const up = (p: Partial<GraphConfig>) => s.updateGraph(g.id, p);
  const fig = useMemo(() => buildFigure(g, s.datasets, s.dataType), [g, s.datasets, s.dataType]);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const keys = fig.analysis.series.map((x) => x.key);

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="space-y-3">
        <Field label="Title"><Inp value={g.title} onChange={(e) => up({ title: e.target.value })} /></Field>
        <Field label="Subtitle"><Inp value={g.subtitle} onChange={(e) => up({ subtitle: e.target.value })} /></Field>
        <Field label={s.dataType === "triggered" ? "X-axis (trigger / mode column)" : "X-axis (time column)"}>
          <Sel value={g.xCol} onChange={(e) => up({ xCol: e.target.value })}>
            <option value="">— select —</option>
            {headers.map((h) => <option key={h}>{h}</option>)}
          </Sel>
        </Field>
        <Field label="Y parameters (multi-select)">
          <div className="max-h-44 overflow-auto rounded border bg-background p-1 text-sm">
            {headers.filter((h) => h !== g.xCol).map((h) => (
              <label key={h} className="flex items-center gap-2 px-1 py-0.5 text-foreground">
                <input type="checkbox" checked={g.yCols.includes(h)} onChange={() => up({ yCols: toggle(g.yCols, h) })} />{h}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Datasets in graph">
          <div className="rounded border bg-background p-1 text-sm">
            {s.datasets.map((d) => (
              <label key={d.id} className="flex items-center gap-2 px-1 text-foreground">
                <input type="checkbox" checked={g.datasetIds.includes(d.id)} onChange={() => up({ datasetIds: toggle(g.datasetIds, d.id) })} />{d.name} <span className="text-xs text-muted-foreground">v{d.version}</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X-axis title"><Inp value={g.xLabel} placeholder={g.xCol} onChange={(e) => up({ xLabel: e.target.value })} /></Field>
          <Field label="Y-axis title / unit"><Inp value={g.yLabel} onChange={(e) => up({ yLabel: e.target.value })} /></Field>
          <Field label="Range min (X)"><Inp value={g.rangeMin} onChange={(e) => up({ rangeMin: e.target.value })} /></Field>
          <Field label="Range max (X)"><Inp value={g.rangeMax} onChange={(e) => up({ rangeMax: e.target.value })} /></Field>
          <Field label="Legend"><Sel value={g.legend} onChange={(e) => up({ legend: e.target.value as GraphConfig["legend"] })}>{["top", "bottom", "right", "left"].map((v) => <option key={v}>{v}</option>)}</Sel></Field>
          <Field label="Graph type"><Sel value={g.mode} onChange={(e) => up({ mode: e.target.value as GraphConfig["mode"] })}><option value="lines">Line</option><option value="markers">Scatter</option><option value="lines+markers">Line + markers</option></Sel></Field>
        </div>
        <div className="space-y-2 rounded border p-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.showDiff} onChange={(e) => up({ showDiff: e.target.checked })} />Difference analysis</label>
          {g.showDiff && <div className="grid grid-cols-2 gap-2">
            <Field label="Reference"><Sel value={g.refId} onChange={(e) => up({ refId: e.target.value })}>{s.datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>
            <Field label="Mode"><Sel value={g.diffMode} onChange={(e) => up({ diffMode: e.target.value as "abs" | "pct" })}><option value="abs">Absolute</option><option value="pct">Percentage</option></Sel></Field>
            {s.dataType === "1hz" && <Field label="Alignment" className="col-span-2"><Sel value={g.align} onChange={(e) => up({ align: e.target.value as "exact" | "interp" })}><option value="exact">Exact matching X values</option><option value="interp">Interpolate reference onto X</option></Sel></Field>}
          </div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => s.duplicateGraph(g.id)}>Duplicate</Btn>
          <Btn variant="danger" onClick={() => s.removeGraph(g.id)}>Delete graph</Btn>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <Warnings items={fig.analysis.warnings} />
        <Plot data={fig.data} layout={fig.layout} className="h-[520px] w-full rounded border" />
        <div className="flex flex-wrap gap-2">
          <Btn onClick={async () => downloadDataUrl(await figureToPng(fig), `${safe(g.title)}.png`)}>Download PNG</Btn>
          <Btn onClick={() => exportGraphData(fig.analysis, g, s.datasets, "xlsx")}>Export Excel</Btn>
          <Btn onClick={() => exportGraphData(fig.analysis, g, s.datasets, "csv")}>Export CSV</Btn>
        </div>
        {fig.analysis.diffs.map((d) => <p key={d.key} className="text-xs text-muted-foreground">Alignment: {d.label} — {d.note}</p>)}
        {keys.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Show</th><th>Legend name</th><th>Colour</th><th>Width</th><th>Style</th></tr></thead>
            <tbody>{keys.map((k) => { const st = traceStyle(g, s.datasets, k); const set = (p: object) => up({ styles: { ...g.styles, [k]: { ...g.styles[k], ...p } } }); return (
              <tr key={k}>
                <td><input type="checkbox" checked={!g.hidden.includes(k)} onChange={() => up({ hidden: toggle(g.hidden, k) })} /></td>
                <td><Inp className="w-full" value={st.label} onChange={(e) => set({ label: e.target.value })} /></td>
                <td><input type="color" value={st.color} onChange={(e) => set({ color: e.target.value })} /></td>
                <td><Inp type="number" className="w-16" min={0.5} step={0.5} value={st.width} onChange={(e) => set({ width: +e.target.value })} /></td>
                <td><Sel value={st.dash} onChange={(e) => set({ dash: e.target.value })}>{["solid", "dash", "dot", "dashdot"].map((v) => <option key={v}>{v}</option>)}</Sel></td>
              </tr>); })}</tbody>
          </table>
        )}
        {fig.analysis.series.length > 0 && (
          <table className="w-full font-mono text-xs">
            <thead><tr className="bg-muted text-left">{STATS_HEAD.map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
            <tbody>{statsRows(fig.analysis, g, s.datasets).map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-2 py-0.5">{c}</td>)}</tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
