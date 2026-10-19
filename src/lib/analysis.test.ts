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

  it("matches aliases despite case, separators, and unit suffix differences", () => {
    const dataset = {
      id: "dataset-b",
      name: "Test B",
      version: 1,
      headers: ["MODE", "fb val [kg/h]"],
      rows: [["Mode 1", 2.5], ["Mode 2", 2.8]],
    } as Dataset;
    const graph = {
      id: "graph-b",
      title: "Fuel rate",
      subtitle: "",
      xCol: "mode",
      yCols: ["fc-rate"],
      datasetIds: ["dataset-b"],
      xLabel: "",
      yLabel: "",
      legend: "bottom",
      mode: "lines",
      styles: {},
      hidden: [],
      rangeMin: "",
      rangeMax: "",
      showDiff: false,
      diffMode: "abs",
      refId: "dataset-b",
      align: "exact",
    } as GraphConfig;

    const series = getSeries(dataset, graph, "fc-rate", { "FC RATE": ["FB_VAL"] });
    expect(series?.x).toEqual(["Mode 1", "Mode 2"]);
    expect(series?.y).toEqual([2.5, 2.8]);
  });

  it("does not discard categorical triggered rows when numeric X range fields are set", () => {
    const dataset = {
      id: "dataset-c",
      name: "Triggered",
      version: 1,
      headers: ["Mode", "Torque"],
      rows: [["Idle", 12], ["Rated", 30]],
    } as Dataset;
    const graph = {
      id: "graph-c",
      title: "Triggered comparison",
      subtitle: "",
      xCol: "Mode",
      yCols: ["Torque"],
      datasetIds: ["dataset-c"],
      xLabel: "",
      yLabel: "",
      legend: "bottom",
      mode: "lines",
      styles: {},
      hidden: [],
      rangeMin: "0",
      rangeMax: "10",
      showDiff: false,
      diffMode: "abs",
      refId: "dataset-c",
      align: "exact",
    } as GraphConfig;

    const series = getSeries(dataset, graph, "Torque");
    expect(series?.x).toEqual(["Idle", "Rated"]);
    expect(series?.y).toEqual([12, 30]);
  });

  it("does not silently match parameters with different explicit units", () => {
    const dataset = {
      id: "dataset-units",
      name: "Power test",
      version: 1,
      headers: ["Time", "Power [kW]"],
      rows: [[0, 10]],
    } as Dataset;
    const graph = {
      id: "graph-units",
      title: "Power",
      subtitle: "",
      xCol: "Time",
      yCols: ["Power [hp]"],
      datasetIds: ["dataset-units"],
      xLabel: "",
      yLabel: "",
      legend: "bottom",
      mode: "lines",
      styles: {},
      hidden: [],
      rangeMin: "",
      rangeMax: "",
      showDiff: false,
      diffMode: "abs",
      refId: "dataset-units",
      align: "exact",
    } as GraphConfig;

    expect(getSeries(dataset, graph, "Power [hp]")).toBeNull();
  });
});
