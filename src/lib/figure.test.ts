import { describe, expect, it } from "vitest";
import { buildFigure } from "./figure";
import type { Dataset, GraphConfig } from "./store";

function dataset(id: string, name: string, rows: (string | number)[][]): Dataset {
  return {
    id,
    name,
    fileName: name + ".xlsx",
    version: 1,
    loadedAt: "",
    sheets: {},
    sheet: "Sheet1",
    headerRow: 1,
    unitsRow: 0,
    headers: ["Mode", "Torque"],
    rows,
  };
}

function graph(refId: string, datasetIds: string[]): GraphConfig {
  return {
    id: "graph-1",
    title: "Triggered comparison",
    subtitle: "",
    xCol: "Mode",
    yCols: ["Torque"],
    datasetIds,
    xLabel: "Mode",
    yLabel: "Torque",
    legend: "bottom",
    mode: "lines",
    styles: {},
    hidden: [],
    rangeMin: "",
    rangeMax: "",
    showDiff: true,
    diffMode: "abs",
    refId,
    align: "exact",
  };
}

describe("triggered comparison graph labels", () => {
  it("shows point data labels for every triggered series and its comparison trace", () => {
    const a = dataset("a", "Engine A", [["Idle", 12.3456], ["Rated", 30]]);
    const b = dataset("b", "Engine B", [["Idle", 14], ["Rated", 28]]);
    const figure = buildFigure(graph("a", ["a", "b"]), [a, b], "triggered");
    expect(figure.data.length).toBe(3);

    for (const trace of figure.data as { mode?: string; text?: string[] }[]) {
      expect(trace.mode).toContain("text");
      expect(trace.text).toBeDefined();
      expect(trace.text?.length).toBe(2);
    }
    expect((figure.data[0] as { text: string[] }).text[0]).toBe("12.346");
  });
});
