import { useCallback, useEffect, useRef, useState } from "react";
import { loadPlotly } from "@/lib/figure";

type AxisView = {
  range?: [unknown, unknown];
  autorange: boolean;
};
type ViewState = { xaxis: AxisView; yaxis: AxisView };
type PlotElement = HTMLDivElement & {
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
};

function rangePair(value: unknown): [unknown, unknown] | undefined {
  return Array.isArray(value) && value.length >= 2 ? [value[0], value[1]] : undefined;
}

function viewFromLayout(layout: object): ViewState {
  const value = layout as {
    xaxis?: { range?: unknown; autorange?: boolean };
    yaxis?: { range?: unknown; autorange?: boolean };
  };
  const xRange = rangePair(value.xaxis?.range);
  const yRange = rangePair(value.yaxis?.range);
  return {
    xaxis: { range: xRange, autorange: value.xaxis?.autorange ?? !xRange },
    yaxis: { range: yRange, autorange: value.yaxis?.autorange ?? !yRange },
  };
}

function mergeRelayout(previous: ViewState, event: Record<string, unknown>): ViewState | null {
  let changed = false;
  const next: ViewState = {
    xaxis: { ...previous.xaxis, range: previous.xaxis.range ? [...previous.xaxis.range] : undefined },
    yaxis: { ...previous.yaxis, range: previous.yaxis.range ? [...previous.yaxis.range] : undefined },
  };

  for (const axis of ["xaxis", "yaxis"] as const) {
    const wholeRange = rangePair(event[`${axis}.range`]);
    const range0 = event[`${axis}.range[0]`];
    const range1 = event[`${axis}.range[1]`];
    if (event[`${axis}.autorange`] === true) {
      next[axis] = { range: undefined, autorange: true };
      changed = true;
    } else if (wholeRange || range0 !== undefined || range1 !== undefined) {
      const before = next[axis].range;
      const range: [unknown, unknown] = wholeRange ?? [
        range0 !== undefined ? range0 : before?.[0],
        range1 !== undefined ? range1 : before?.[1],
      ];
      if (range[0] !== undefined && range[1] !== undefined) {
        next[axis] = { range, autorange: false };
        changed = true;
      }
    }
  }
  return changed ? next : null;
}

function sameView(a: ViewState, b: ViewState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function viewRelayoutArgs(view: ViewState) {
  const result: Record<string, unknown> = {};
  for (const axis of ["xaxis", "yaxis"] as const) {
    if (view[axis].autorange || !view[axis].range) {
      result[`${axis}.autorange`] = true;
    } else {
      result[`${axis}.autorange`] = false;
      result[`${axis}.range`] = view[axis].range;
    }
  }
  return result;
}

export function Plot({
  data,
  layout,
  className,
  onReady,
  historyKey,
}: {
  data: object[];
  layout: object;
  className?: string;
  onReady?: (el: HTMLDivElement) => void;
  historyKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cursorX = useRef<unknown>(null);
  const plotlyRef = useRef<any>(null);
  const undoStack = useRef<ViewState[]>([]);
  const redoStack = useRef<ViewState[]>([]);
  const currentView = useRef<ViewState>(viewFromLayout(layout));
  const initialView = useRef<ViewState>(viewFromLayout(layout));
  const initializedForKey = useRef<string | undefined>(undefined);
  const suppressHistory = useRef(false);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const [readout, setReadout] = useState<{ x: string; values: { name: string; y: string }[] } | null>(null);

  const updateHistoryCounts = useCallback(() => {
    setHistoryCounts({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const applyView = useCallback(async (view: ViewState) => {
    const el = ref.current;
    const Plotly = plotlyRef.current;
    if (!el || !Plotly) return;
    suppressHistory.current = true;
    currentView.current = view;
    try {
      await Plotly.relayout(el, viewRelayoutArgs(view));
    } finally {
      suppressHistory.current = false;
      updateHistoryCounts();
    }
  }, [updateHistoryCounts]);

  const undo = useCallback(async () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(currentView.current);
    await applyView(previous);
    updateHistoryCounts();
  }, [applyView, updateHistoryCounts]);

  const redo = useCallback(async () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(currentView.current);
    await applyView(next);
    updateHistoryCounts();
  }, [applyView, updateHistoryCounts]);

  const resetView = useCallback(async () => {
    if (sameView(currentView.current, initialView.current)) return;
    undoStack.current.push(currentView.current);
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    await applyView(initialView.current);
    updateHistoryCounts();
  }, [applyView, updateHistoryCounts]);

  useEffect(() => {
    let alive = true;
    let removePlotListeners: (() => void) | undefined;
    loadPlotly().then(async (Plotly) => {
      if (!alive || !ref.current) return;
      const el = ref.current as PlotElement;
      plotlyRef.current = Plotly;

      if (initializedForKey.current !== historyKey) {
        initializedForKey.current = historyKey;
        const startingView = viewFromLayout(layout);
        currentView.current = startingView;
        initialView.current = startingView;
        undoStack.current = [];
        redoStack.current = [];
        setHistoryCounts({ undo: 0, redo: 0 });
        cursorX.current = null;
      }

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
      await Plotly.react(el, data, { ...layout, shapes, autosize: true, uirevision: `enginelab-${historyKey ?? "plot"}` }, {
        responsive: true,
        displaylogo: false,
        scrollZoom: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        modeBarButtonsToAdd: ["toggleSpikelines"],
        edits: { shapePosition: true },
        toImageButtonOptions: { format: "png", width: 1600, height: 800, scale: 1 },
      });
      if (!alive) return;
      el.tabIndex = 0;
      el.setAttribute("aria-label", "Interactive graph. Use Control Z or Control U to undo zoom and pan. Use Control Y or Control Shift Z to redo.");

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
        el.focus({ preventScroll: true });
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
        if (suppressHistory.current) return;
        const next = mergeRelayout(currentView.current, event);
        if (!next || sameView(next, currentView.current)) return;
        undoStack.current.push(currentView.current);
        if (undoStack.current.length > 60) undoStack.current.shift();
        currentView.current = next;
        redoStack.current = [];
        updateHistoryCounts();
      };
      const focusPlot = () => { el.focus({ preventScroll: true }); };
      const onKeyDown = (event: KeyboardEvent) => {
        if (!event.ctrlKey) return;
        const key = event.key.toLowerCase();
        if (!["z", "y", "u"].includes(key)) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
        if (!ref.current?.contains(document.activeElement)) return;
        if ((key === "z" && !event.shiftKey) || key === "u") {
          event.preventDefault();
          void undo();
        } else if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault();
          void redo();
        }
      };
      el.addEventListener("pointerdown", focusPlot);
      window.addEventListener("keydown", onKeyDown, true);
      el.on("plotly_click", onClick);
      el.on("plotly_relayout", onRelayout);
      removePlotListeners = () => {
        el.removeEventListener("pointerdown", focusPlot);
        window.removeEventListener("keydown", onKeyDown, true);
        el.removeListener("plotly_click", onClick);
        el.removeListener("plotly_relayout", onRelayout);
      };
      onReady?.(el);
    }).catch((error: unknown) => {
      if (alive) console.error("EngineLab graph could not be rendered:", error);
    });
    return () => {
      alive = false;
      removePlotListeners?.();
    };
  }, [data, layout, onReady, historyKey, undo, redo, updateHistoryCounts]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      loadPlotly().then((P) => el && P.purge(el));
    };
  }, []);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="absolute right-2 top-2 z-20 flex gap-1 rounded border bg-background/95 p-1 shadow-sm">
        <button type="button" className="rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40" title="Undo graph view (Ctrl+Z or Ctrl+U)" aria-label="Undo graph view" disabled={!historyCounts.undo} onClick={() => void undo()}>↶ Undo</button>
        <button type="button" className="rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40" title="Redo graph view (Ctrl+Y or Ctrl+Shift+Z)" aria-label="Redo graph view" disabled={!historyCounts.redo} onClick={() => void redo()}>↷ Redo</button>
        <button type="button" className="rounded px-2 py-1 text-xs" title="Reset graph view" aria-label="Reset graph view" onClick={() => void resetView()}>Reset</button>
      </div>
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
