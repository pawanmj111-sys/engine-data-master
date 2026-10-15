import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { buildFigure } from "@/lib/figure";
import { Btn, Sel, Warnings } from "@/components/kit";
import { Plot } from "@/components/Plot";
import { ReplaceButton } from "@/components/DatasetRow";

export const Route = createFileRoute("/present")({
  head: () => ({
    meta: [
      { title: "Presentation Mode — EngineLab" },
      { name: "description", content: "Meeting-ready full-screen view of prepared comparison graphs." },
      { property: "og:title", content: "Presentation Mode — EngineLab" },
      { property: "og:description", content: "Meeting-ready full-screen view of prepared comparison graphs." },
    ],
  }),
  component: Present,
});

function Present() {
  const s = useApp();
  const [i, setI] = useState(0);
  const [info, setInfo] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const n = s.graphs.length;
  const g = s.graphs[Math.min(i, n - 1)];
  const fig = useMemo(() => (g ? buildFigure(g, s.datasets, s.dataType, true) : null), [g, s.datasets, s.dataType]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(n - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n]);
  const used = g ? s.datasets.filter((d) => g.datasetIds.includes(d.id)) : [];

  return (
    <div ref={root} className="flex h-screen flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        <Link to="/compare" className="text-sm text-primary">← Back to editor</Link>
        <Btn onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>‹ Previous</Btn>
        <Sel value={i} onChange={(e) => setI(+e.target.value)}>{s.graphs.map((x, k) => <option key={x.id} value={k}>{k + 1}. {x.title}</option>)}</Sel>
        <Btn onClick={() => setI(Math.min(n - 1, i + 1))} disabled={i >= n - 1}>Next ›</Btn>
        <label className="ml-2 flex items-center gap-1 text-sm"><input type="checkbox" checked={info} onChange={(e) => setInfo(e.target.checked)} />Show cycle & datasets</label>
        <Btn className="ml-auto" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())}>Full screen</Btn>
      </div>
      {!g || !fig ? (
        <div className="m-auto text-muted-foreground">No graphs prepared. <Link to="/compare" className="text-primary">Configure graphs</Link></div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
          {info && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded bg-accent px-2 py-0.5 font-semibold text-accent-foreground">{s.cycle} · {s.dataType === "1hz" ? "1 Hz" : "Triggered"}</span>
              {used.map((d) => (
                <span key={d.id} className="flex items-center gap-2 rounded border px-2 py-0.5">
                  {d.name} <span className="font-mono text-xs text-primary">v{d.version} · {d.fileName}</span>
                  <ReplaceButton d={d} />
                </span>
              ))}
            </div>
          )}
          <Warnings items={fig.analysis.warnings} />
          <Plot data={fig.data} layout={fig.layout} className="min-h-0 w-full flex-1" />
          <div className="text-center text-xs text-muted-foreground">Graph {i + 1} of {n} · use ← → keys</div>
        </div>
      )}
    </div>
  );
}
