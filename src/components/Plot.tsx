import { useEffect, useRef, useState } from "react";
import { loadPlotly } from "@/lib/figure";

export function Plot({
  data,
  layout,
  className,
  onReady,
}: {
  data: object[];
  layout: object;
  className?: string;
  onReady?: (el: HTMLDivElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cursorX = useRef<unknown>(null);
  const [readout, setReadout] = useState<{ x: string; values: { name: string; y: string }[] } | null>(null);
  useEffect(() => {
    let alive = true;
    let removePlotListeners: (() => void) | undefined;
    loadPlotly().then(async (Plotly) => {
      if (!alive || !ref.current) return;
      const el = ref.current;
      const firstTrace = data[0] as { x?: unknown[] } | undefined;
      const initialX = firstTrace?.x?.find((value) => value !== null && value !== undefined);
      if (cursorX.current === null && initialX !== undefined) cursorX.current = initialX;
      const shapes = Array.isArray((layout as { shapes?: unknown[] }).shapes)
        ? [...((layout as { shapes: unknown[] }).shapes)]
        : [];
      const cursorShapeIndex = shapes.length;
      if (cursorX.current !== null) {
        shapes.push({
          type: "line",
          xref: "x",
          yref: "paper",
          x0: cursorX.current,
          x1: cursorX.current,
          y0: 0,
          y1: 1,
          editable: true,
          line: { color: "#b45309", width: 2, dash: "dot" },
        });
      }
      await Plotly.react(el, data, { ...layout, shapes, autosize: true }, {
        responsive: true,
        displaylogo: false,
        scrollZoom: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        modeBarButtonsToAdd: ["toggleSpikelines"],
        edits: { shapePosition: true },
        toImageButtonOptions: { format: "png", width: 1600, height: 800, scale: 1 },
      });
      if (!alive) return;
      const plotEl = el as HTMLDivElement & { on: (event: string, handler: (...args: any[]) => void) => void; removeListener: (event: string, handler: (...args: any[]) => void) => void };
      const updateReadout = (x: unknown) => {
        const traces = data as { x?: unknown[]; y?: unknown[]; name?: string }[];
        const values = traces.map((trace) => {
          if (!Array.isArray(trace.x) || !Array.isArray(trace.y)) return null;
          let index = trace.x.findIndex((value) => String(value) === String(x));
          if (index < 0 && typeof x === "number") {
            let bestDistance = Infinity;
            trace.x.forEach((value, i) => {
              if (typeof value !== "number") return;
              const distance = Math.abs(value - x);
              if (distance < bestDistance) { bestDistance = distance; index = i; }
            });
          }
          if (index < 0 || index >= trace.y.length) return null;
          const y = trace.y[index];
          return { name: trace.name || "Series", y: typeof y === "number" ? String(Number(y.toPrecision(6))) : String(y ?? "—") };
        }).filter((value): value is { name: string; y: string } => value !== null);
        setReadout({ x: String(x), values });
      };
      const onClick = (event: { points?: { x?: unknown }[] }) => {
        const x = event.points?.[0]?.x;
        if (x === undefined || x === null) return;
        cursorX.current = x;
        updateReadout(x);
        void Plotly.relayout(el, { [`shapes[${cursorShapeIndex}].x0`]: x, [`shapes[${cursorShapeIndex}].x1`]: x });
      };
      const onRelayout = (event: Record<string, unknown>) => {
        const x0 = event[`shapes[${cursorShapeIndex}].x0`];
        const x1 = event[`shapes[${cursorShapeIndex}].x1`];
        const x = x1 ?? x0;
        if (x !== undefined && x !== null) { cursorX.current = x; updateReadout(x); }
      };
      plotEl.on("plotly_click", onClick);
      plotEl.on("plotly_relayout", onRelayout);
      removePlotListeners = () => {
        plotEl.removeListener("plotly_click", onClick);
        plotEl.removeListener("plotly_relayout", onRelayout);
      };
      onReady?.(el);
    });
    return () => {
      alive = false;
      removePlotListeners?.();
    };
  }, [data, layout, onReady]);
  useEffect(() => {
    const el = ref.current;
    return () => {
      loadPlotly().then((P) => el && P.purge(el));
    };
  }, []);
  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={ref} className="h-full w-full" />
      {readout && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 max-h-28 max-w-[calc(100%-1rem)] overflow-auto rounded border bg-background/95 p-2 text-xs shadow">
          <div className="mb-1 font-semibold">Analysis cursor · X = {readout.x}</div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 md:grid-cols-2">
            {readout.values.map((item, index) => (
              <div key={`${item.name}-${index}`}><span className="font-medium">{item.name}:</span> {item.y}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
