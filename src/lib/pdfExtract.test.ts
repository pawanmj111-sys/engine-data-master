import { describe, expect, it } from "vitest";
import { extractFromLines, parseEngineOutSpecificResultsFromItems, type PositionedPdfTextItem } from "./pdfExtract";

const reportLines = [
  "Test cycle NRTC",
  "Overall status: Failed",
  "Emission limits - Stage V NRE (NRE-v-3/NRE-c-3)",
  "CO uncorrected [g/kWh] 0.286 5.000 Passed Tailpipe EBH02",
  "NOX+HC [g/kWh] 3.369 4.700 Passed Tailpipe EBH02",
  "Particulate mass [g/kWh] 0.189 0.015 Failed Tailpipe SPC47x",
  "Particulate number [#/kWh] 2.64E+014 1.00E+012 Failed SPC47x AVL489",
  "EngineOut EBH01 bench results - not driftcorrected",
  "Emission limits - Stage V NRE (nested EngineOut section)",
  "CO uncorrected [g/kWh] Actual 99.999 Limit 5.000 Failed Sample point EngineOut Device EBH01",
  "Particulate mass [g/kWh] Actual 90.000 Limit 0.015 Failed Sample point EngineOut Device EBH01",
  "Specific results Phase 1",
  "CH4 [g/kWh] -0.009",
  "CO2 [g/kWh] 963.382",
  "COH [g/kWh] 3.919",
  "CO (COH - EngineOut) [g/kWh] 3.919",
  "THC [g/kWh] 1.006",
  "NO2 (NOX,NO - EngineOut) [g/kWh] 0.595",
  "NOX [g/kWh] 3.244",
  "NO [g/kWh] 1.747",
  "O2 [g/kWh] 1368.425",
];

describe("Stage V PDF extraction", () => {
  it("selects the explicit top-level summary instead of a nested matching section", () => {
    const rec = extractFromLines(reportLines, "2025_06_460_NRTC_WI_DOC.pdf", "NRTC");

    expect(rec.status).toBe("extracted");
    expect(rec.values.co).toBe("0.286");
    expect(rec.values.coLimit).toBe("5.000");
    expect(rec.values.coStatus).toBe("Passed");
    expect(rec.values.coSamplePoint).toBe("Tailpipe");
    expect(rec.values.coDevice).toBe("EBH02");

    expect(rec.values.noxHc).toBe("3.369");
    expect(rec.values.noxHcLimit).toBe("4.700");
    expect(rec.values.noxHcStatus).toBe("Passed");
    expect(rec.values.pm).toBe("0.189");
    expect(rec.values.pmLimit).toBe("0.015");
    expect(rec.values.pmStatus).toBe("Failed");
    expect(rec.values.pmSamplePoint).toBe("Tailpipe");
    expect(rec.values.pmDevice).toBe("SPC47x");

    expect(rec.values.pn).toBe("2.64E+014");
    expect(rec.values.pnLimit).toBe("1.00E+012");
    expect(rec.values.pnStatus).toBe("Failed");
    expect(rec.values.pnSamplePoint).toBe("SPC47x");
    expect(rec.values.pnDevice).toBe("AVL489");
    expect(rec.values.result).toBe("Fail");
    expect(rec.values.limits).toContain("Particulate number ≤ 1.00E+012");
  });

  it("extracts the EngineOut EBH01 specific results separately", () => {
    const rec = extractFromLines(reportLines, "2025_06_460_NRTC_WI_DOC.pdf", "NRTC");
    const details = rec.values.engineOutDetails ?? "";

    for (const expected of [
      "CH4: -0.009 g/kWh",
      "CO2: 963.382 g/kWh",
      "COH: 3.919 g/kWh",
      "CO (COH - EngineOut): 3.919 g/kWh",
      "THC: 1.006 g/kWh",
      "NO2 (NOX,NO - EngineOut): 0.595 g/kWh",
      "NOX: 3.244 g/kWh",
      "NO: 1.747 g/kWh",
      "O2: 1368.425 g/kWh",
    ]) expect(details).toContain(expected);
  });

  it("uses PDF item coordinates to read only the EngineOut Specific results column", () => {
    const items: PositionedPdfTextItem[] = [
      { page: 10, x: 10, y: 780, text: "EngineOut (EBH01) bench results - not driftcorrected" },
      { page: 10, x: 534, y: 730, text: "Specific results" },
      { page: 10, x: 7, y: 500, text: "Fuel consumption" },
      { page: 10, x: 275, y: 712, text: "CH4" },
      { page: 10, x: 330, y: 712, text: "999.999" },
      { page: 10, x: 538, y: 712, text: "CH4" },
      { page: 10, x: 580, y: 712, text: "[g/kWh]" },
      { page: 10, x: 630, y: 712, text: "-0.009" },
      { page: 10, x: 538, y: 702, text: "CO2" },
      { page: 10, x: 580, y: 702, text: "[g/kWh]" },
      { page: 10, x: 630, y: 702, text: "963.382" },
      { page: 10, x: 538, y: 692, text: "COH" },
      { page: 10, x: 580, y: 692, text: "[g/kWh]" },
      { page: 10, x: 630, y: 692, text: "3.919" },
      { page: 10, x: 538, y: 682, text: "CO (COH - EngineOut)" },
      { page: 10, x: 580, y: 682, text: "[g/kWh]" },
      { page: 10, x: 630, y: 682, text: "3.919" },
      { page: 10, x: 538, y: 672, text: "THC" },
      { page: 10, x: 580, y: 672, text: "[g/kWh]" },
      { page: 10, x: 630, y: 672, text: "1.006" },
      { page: 10, x: 538, y: 662, text: "NO2 (NOX,NO - EngineOut)" },
      { page: 10, x: 580, y: 662, text: "[g/kWh]" },
      { page: 10, x: 630, y: 662, text: "0.595" },
      { page: 10, x: 538, y: 652, text: "NOX" },
      { page: 10, x: 580, y: 652, text: "[g/kWh]" },
      { page: 10, x: 630, y: 652, text: "3.244" },
      { page: 10, x: 538, y: 642, text: "NO" },
      { page: 10, x: 580, y: 642, text: "[g/kWh]" },
      { page: 10, x: 630, y: 642, text: "1.747" },
      { page: 10, x: 538, y: 632, text: "O2" },
      { page: 10, x: 580, y: 632, text: "[g/kWh]" },
      { page: 10, x: 630, y: 632, text: "1368.425" },
    ];

    const values = parseEngineOutSpecificResultsFromItems(items);
    expect(values.engineOutCH4).toBe("-0.009");
    expect(values.engineOutCO2).toBe("963.382");
    expect(values.engineOutCOH).toBe("3.919");
    expect(values.engineOutCO).toBe("3.919");
    expect(values.engineOutTHC).toBe("1.006");
    expect(values.engineOutNO2).toBe("0.595");
    expect(values.engineOutNOX).toBe("3.244");
    expect(values.engineOutNO).toBe("1.747");
    expect(values.engineOutO2).toBe("1368.425");
    expect(values.engineOutCH4).not.toBe("999.999");
  });

  it("does not invent values when there is no Stage V table", () => {
    const rec = extractFromLines(["Ordinary text in a PDF with no pollutant results."], "empty.pdf", "NRSC");
    expect(rec.status).toBe("review");
    expect(rec.values.co).toBeUndefined();
    expect(rec.values.pn).toBeUndefined();
  });
});
