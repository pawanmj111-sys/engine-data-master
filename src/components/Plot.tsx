import { useEffect, useRef } from "react";
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
  useEffect(() => {
    let alive = true;
    loadPlotly().then(async (Plotly) => {
      if (!alive || !ref.current) return;
      const el = ref.current;
      const firstTrace = data[0] as { x?: unknown[] } | undefined;
      const initialX = firstTrace?.x?.find((value) => value !== null && value !== undefined);
      if (cursorX.current === null && initialX !== undefined) cursorX.current = initialX;
      const shapes = Array.isArray((layout as { shapes?: unknown[] }).shapes)
        ? [...((layout as { shapes: unknown[] }).shapes)]
        : [];
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
      const onClick = (event: { points?: { x?: unknown }[] }) => {
        const x = event.points?.[0]?.x;
        if (x === undefined || x === null) return;
        cursorX.current = x;
        void Plotly.relayout(el, { "shapes[0].x0": x, "shapes[0].x1": x });
      };
      const onRelayout = (event: Record<string, unknown>) => {
        const x0 = event["shapes[0].x0"];
        const x1 = event["shapes[0].x1"];
        const x = x1 ?? x0;
        if (x !== undefined && x !== null) cursorX.current = x;
      };
      el.on("plotly_click", onClick);
      el.on("plotly_relayout", onRelayout);
      onReady?.(el);
      return () => {
        el.removeListener("plotly_click", onClick);
        el.removeListener("plotly_relayout", onRelayout);
      };
    });
    return () => {
      alive = false;
    };
  }, [data, layout, onReady]);
  useEffect(() => {
    const el = ref.current;
    return () => {
      loadPlotly().then((P) => el && P.purge(el));
    };
  }, []);
  return <div ref={ref} className={className} />;
}
