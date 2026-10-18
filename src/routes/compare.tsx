import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp, uid, type GraphConfig } from "@/lib/store";
import { readFileSheets } from "@/lib/parse";
import { buildFigure, exportGraphData, figureToPng, safe, statsRows, STATS_HEAD, traceStyle } from "@/lib/figure";
import { downloadDataUrl, exportPdf } from "@/lib/report";
import { buildCompareReport, exportCompareWorkbook } from "@/lib/builders";
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
  const templateRef = useRef<HTMLInputElement>(null);
  const templateActionRef = useRef<"load" | "pdf" | "xlsx">("load");
  const [selectedCyclicRecordId, setSelectedCyclicRecordId] = useState("");
  const [aliasCanonical, setAliasCanonical] = useState("");
  const [aliasSynonyms, setAliasSynonyms] = useState("");
  const allHeaders = useMemo(() => [...new Set([...s.datasets.flatMap((d) => d.headers), ...Object.keys(s.parameterAliases)])], [s.datasets, s.parameterAliases]);
  const selectedCyclicRecord = s.cyclicRecords.find((record) => record.id === selectedCyclicRecordId) ?? s.cyclicRecords[s.cyclicRecords.length - 1];
  const g = s.graphs.find((x) => x.id === s.activeGraph) ?? s.graphs[0];

  const onFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try { s.addDataset(f.name, await readFileSheets(f)); toast.success(`Loaded ${f.name}`); }
      catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
    }
  };

  const saveTemplate = () => {
    const payload = {
      format: "EngineDataMasterGraphTemplate",
      version: 1,
      cycle: s.cycle,
      dataType: s.dataType,
      parameterAliases: s.parameterAliases,
      graphs: s.graphs.map((graph) => ({ ...graph, datasetIds: [], refId: "", styles: {}, hidden: [] })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "engine-data-master-template.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template saved as a JSON file. Dataset contents are not included.");
  };

  const loadTemplate = async (file: File, exportAfterLoad: "load" | "pdf" | "xlsx" = "load") => {
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.format !== "EngineDataMasterGraphTemplate" || parsed.version !== 1 || !Array.isArray(parsed.graphs)) {
        throw new Error("This is not a supported Engine Data Master template.");
      }
      const validGraphs = parsed.graphs.filter((candidate): candidate is GraphConfig => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
        const graph = candidate as Partial<GraphConfig>;
        return typeof graph.title === "string" &&
          typeof graph.xCol === "string" &&
          Array.isArray(graph.yCols) &&
          Array.isArray(graph.datasetIds) &&
          typeof graph.subtitle === "string" &&
          typeof graph.xLabel === "string" &&
          typeof graph.yLabel === "string";
      });
      if (!validGraphs.length) throw new Error("No valid graph configurations were found in this template.");
      const graphs = validGraphs.map((graph) => ({
        ...graph,
        id: uid(),
        datasetIds: s.datasets.map((d) => d.id),
        refId: s.datasets[0]?.id ?? "",
        styles: {},
        hidden: [],
      }));
      const cycle = ["FTP", "NRTC", "NRSC", "RMC"].includes(parsed.cycle) ? parsed.cycle as typeof s.cycle : s.cycle;
      const dataType = parsed.dataType === "triggered" ? "triggered" as const : "1hz" as const;
      const aliases: Record<string, string[]> = {};
      if (parsed.parameterAliases && typeof parsed.parameterAliases === "object" && !Array.isArray(parsed.parameterAliases)) {
        for (const [key, value] of Object.entries(parsed.parameterAliases)) {
          if (key.trim() && Array.isArray(value)) aliases[key] = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        }
      }
      s.set({ cycle, dataType, graphs, activeGraph: graphs[0].id, parameterAliases: aliases });
      window.localStorage.setItem("engine-data-master:parameter-aliases", JSON.stringify(aliases));
      toast.success(`Loaded ${graphs.length} graph configuration(s). Check any parameter-mapping warnings for the selected datasets.`);
      if (exportAfterLoad === "pdf") {
        const current = useApp.getState();
        const doc = await buildCompareReport(current);
        await exportPdf(doc, `${current.cycle}_comparison_report.pdf`);
        toast.success("Comparison PDF exported from the loaded template.");
      } else if (exportAfterLoad === "xlsx") {
        exportCompareWorkbook(useApp.getState());
        toast.success("Comparison Excel workbook exported from the loaded template.");
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not load template.");
    }
  };

  const saveAlias = () => {
    const canonical = aliasCanonical.trim();
    const alternatives = [...new Set(aliasSynonyms.split(",").map((v) => v.trim()).filter((v) => v && v !== canonical))];
    if (!canonical || !alternatives.length) {
      toast.error("Enter a canonical parameter and at least one alternate column name.");
      return;
    }
    const next = { ...s.parameterAliases, [canonical]: alternatives };
    s.set({ parameterAliases: next });
    window.localStorage.setItem("engine-data-master:parameter-aliases", JSON.stringify(next));
    setAliasCanonical("");
    setAliasSynonyms("");
    toast.success(`Saved mapping for ${canonical}.`);
  };

  const removeAlias = (canonical: string) => {
    const next = { ...s.parameterAliases };
    delete next[canonical];
    s.set({ parameterAliases: next });
    window.localStorage.setItem("engine-data-master:parameter-aliases", JSON.stringify(next));
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

      <Panel title="4 · Reusable templates & parameter mappings">
        <div className="mb-4 flex flex-wrap gap-2">
          <Btn variant="primary" disabled={!s.graphs.length} onClick={saveTemplate}>Save graph template (JSON)</Btn>
          <input ref={templateRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadTemplate(file, templateActionRef.current); e.target.value = ""; }} />
          <Btn onClick={() => { templateActionRef.current = "load"; templateRef.current?.click(); }}>Load template</Btn>
          <Btn disabled={!s.datasets.length} onClick={() => { templateActionRef.current = "pdf"; templateRef.current?.click(); }}>Load template + export PDF</Btn>
          <Btn disabled={!s.datasets.length} onClick={() => { templateActionRef.current = "xlsx"; templateRef.current?.click(); }}>Load template + export Excel</Btn>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Templates save cycle, data type, graph settings, and parameter aliases—not uploaded Excel contents. You can move the JSON template between machines.</p>
        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
          <Field label="Canonical parameter"><Inp value={aliasCanonical} placeholder="e.g. FC RATE" onChange={(e) => setAliasCanonical(e.target.value)} /></Field>
          <Field label="Alternate Excel column names (comma-separated)"><Inp value={aliasSynonyms} placeholder="e.g. FB_VAL, Fuel Flow" onChange={(e) => setAliasSynonyms(e.target.value)} /></Field>
          <div className="flex items-end"><Btn onClick={saveAlias}>Save mapping</Btn></div>
        </div>
        {Object.keys(s.parameterAliases).length > 0 && <div className="mt-3 space-y-1">
          {Object.entries(s.parameterAliases).map(([canonical, aliases]) => <div key={canonical} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
            <span><strong>{canonical}</strong> ↔ {aliases.join(", ")}</span><Btn onClick={() => removeAlias(canonical)}>Remove</Btn>
          </div>)}
        </div>}
      </Panel>

      <Panel title="5 · Graphs" actions={<>
        {s.graphs.map((x) => (
          <Btn key={x.id} variant={x.id === g?.id ? "primary" : "default"} onClick={() => s.set({ activeGraph: x.id })}>{x.title}</Btn>
        ))}
        <Btn onClick={s.addGraph} disabled={!s.datasets.length}>+ Add graph</Btn>
      </>}>
        {g ? <GraphEditor g={g} headers={allHeaders} /> : <p className="text-sm text-muted-foreground">Add a graph after uploading datasets.</p>}
      </Panel>

      <Panel title={`Report front page — ${s.cycle}`}>
        <div className="mb-4 rounded border p-3">
          <div className="mb-2 font-medium">Use a PDF Cyclic Summary on this comparison front page</div>
          <p className="mb-3 text-xs text-muted-foreground">Import metadata and available emission summary values from a PDF already extracted in the PDF Cyclic Summary page. Missing source values stay blank.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="PDF summary record" className="min-w-72 flex-1">
              <Sel value={selectedCyclicRecord?.id ?? ""} onChange={(e) => setSelectedCyclicRecordId(e.target.value)}>
                <option value="">— select a processed PDF —</option>
                {s.cyclicRecords.map((record) => <option key={record.id} value={record.id}>{record.source} ({record.status})</option>)}
              </Sel>
            </Field>
            <Btn disabled={!selectedCyclicRecord} onClick={() => {
              if (!selectedCyclicRecord) return;
              const record = selectedCyclicRecord;
              const recordCycle = ["NRTC", "NRSC", "RMC"].includes(record.values.cycle) ? record.values.cycle as typeof s.cyclicCycle : s.cyclicCycle;
              const front = { ...s.compareFront, fields: [...s.compareFront.fields] };
              const imported: [string, string][] = [
                ["Date", record.values.date ?? ""],
                ["Engine Model", record.values.engineModel ?? record.values.engine ?? ""],
                ["Engine Number", record.values.engineNumber ?? ""],
                ["Test Cycle", recordCycle],
                ["Test ID", record.values.testId ?? ""],
                ["Test Name", record.values.testName ?? ""],
                ["Test File Name", record.source],
                ["PDF Summary Result", record.values.result ?? ""],
                ["CO Actual", record.values.co ?? ""],
                ["CO Limit", record.values.coLimit ?? ""],
                ["CO Status", record.values.coStatus ?? ""],
                ["CO Sample Point", record.values.coSamplePoint ?? ""],
                ["CO Device", record.values.coDevice ?? ""],
                ["NOx+HC Actual", record.values.noxHc ?? ""],
                ["NOx+HC Limit", record.values.noxHcLimit ?? ""],
                ["NOx+HC Status", record.values.noxHcStatus ?? ""],
                ["NOx+HC Sample Point", record.values.noxHcSamplePoint ?? ""],
                ["NOx+HC Device", record.values.noxHcDevice ?? ""],
                ["PM Actual", record.values.pm ?? ""],
                ["PM Limit", record.values.pmLimit ?? ""],
                ["PM Status", record.values.pmStatus ?? ""],
                ["PM Sample Point", record.values.pmSamplePoint ?? ""],
                ["PM Device", record.values.pmDevice ?? ""],
                ["PN Actual", record.values.pn ?? ""],
                ["PN Limit", record.values.pnLimit ?? ""],
                ["PN Status", record.values.pnStatus ?? ""],
                ["PN Sample Point", record.values.pnSamplePoint ?? ""],
                ["PN Device", record.values.pnDevice ?? ""],
                ["EngineOut CH4 [g/kWh]", record.values.engineOutCH4 ?? ""],
                ["EngineOut CO2 [g/kWh]", record.values.engineOutCO2 ?? ""],
                ["EngineOut COH [g/kWh]", record.values.engineOutCOH ?? ""],
                ["EngineOut CO (COH - EngineOut) [g/kWh]", record.values.engineOutCO ?? ""],
                ["EngineOut THC [g/kWh]", record.values.engineOutTHC ?? ""],
                ["EngineOut NO2 (NOX,NO - EngineOut) [g/kWh]", record.values.engineOutNO2 ?? ""],
                ["EngineOut NOX [g/kWh]", record.values.engineOutNOX ?? ""],
                ["EngineOut NO [g/kWh]", record.values.engineOutNO ?? ""],
                ["EngineOut O2 [g/kWh]", record.values.engineOutO2 ?? ""],
              ].filter(([, value]) => value.trim().length > 0);
              for (const [label, value] of imported) {
                const found = front.fields.findIndex((field) => field.label.trim().toLowerCase() === label.toLowerCase());
                if (found >= 0) front.fields[found] = { ...front.fields[found], value, hidden: false };
                else front.fields.push({ id: uid(), label, value, hidden: false, custom: true });
              }
              s.set({ cycle: recordCycle, compareFront: front });
              toast.success("PDF Cyclic Summary values copied to the Excel comparison front page. Review the fields before export.");
            }}>Use PDF summary on front page</Btn>
          </div>
        </div>
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
  const [parameterSearch, setParameterSearch] = useState("");
  const matchingHeaders = useMemo(() => headers.filter((h) => h.toLowerCase().includes(parameterSearch.trim().toLowerCase())), [headers, parameterSearch]);
  const up = (p: Partial<GraphConfig>) => s.updateGraph(g.id, p);
  const fig = useMemo(() => buildFigure(g, s.datasets, s.dataType, false, s.parameterAliases), [g, s.datasets, s.dataType, s.parameterAliases]);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const keys = fig.analysis.series.map((x) => x.key);

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="space-y-3">
        <Field label="Title"><Inp value={g.title} onChange={(e) => up({ title: e.target.value })} /></Field>
        <Field label="Subtitle"><Inp value={g.subtitle} onChange={(e) => up({ subtitle: e.target.value })} /></Field>
        <Field label="Search parameters"><Inp value={parameterSearch} placeholder="Search a parameter (e.g. FB_VAL, FC RATE)" onChange={(e) => setParameterSearch(e.target.value)} /></Field>
        <Field label={s.dataType === "triggered" ? "X-axis (trigger / mode column)" : "X-axis (time column)"}>
          <Sel value={g.xCol} onChange={(e) => up({ xCol: e.target.value })}>
            <option value="">— select —</option>
            {matchingHeaders.map((h) => <option key={h}>{h}</option>)}
          </Sel>
        </Field>
        <Field label="Y parameters (multi-select)">
          <div className="max-h-44 overflow-auto rounded border bg-background p-1 text-sm">
            {matchingHeaders.filter((h) => h !== g.xCol).map((h) => (
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
