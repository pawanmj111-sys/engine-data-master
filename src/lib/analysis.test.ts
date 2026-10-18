import { describe, expect, it } from "vitest";
import { getSeries } from "./analysis";
import type { Dataset, GraphConfig } from "./store";

describe("parameter aliases", () => {
  it("plots equivalent columns when their headers differ between datasets", () => {
    const dataset = {
      id: "dataset-a",
      name: "Test A",
      version: 1,
      headers: ["Time", "FB_VAL"],
      rows: [[0, 3.1], [1, 3.4]],
    } as Dataset;
    const graph = {
      id: "graph-a",
      title: "Fuel rate",
      subtitle: "",
      xCol: "Time",
      yCols: ["FC RATE"],
      datasetIds: ["dataset-a"],
      xLabel: "Time",
      yLabel: "Fuel rate",
      legend: "bottom",
      mode: "lines",
      styles: {},
      hidden: [],
      rangeMin: "",
      rangeMax: "",
      showDiff: false,
      diffMode: "abs",
      refId: "dataset-a",
      align: "exact",
    } as GraphConfig;

    const series = getSeries(dataset, graph, "FC RATE", { "FC RATE": ["FB_VAL"] });
    expect(series?.col).toBe("FC RATE");
    expect(series?.y).toEqual([3.1, 3.4]);
  });
});
