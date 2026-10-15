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
  useEffect(() => {
    let alive = true;
    loadPlotly().then((Plotly) => {
      if (!alive || !ref.current) return;
      Plotly.react(ref.current, data, { ...layout, autosize: true }, {
        responsive: true,
        displaylogo: false,
        scrollZoom: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        toImageButtonOptions: { format: "png", width: 1600, height: 800, scale: 1 },
      });
      onReady?.(ref.current);
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
