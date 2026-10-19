import { describe, expect, it } from "vitest";
import { extractFromLines, extractPdf, parseEngineOutSpecificResultsFromItems, parseTailpipeSpecificResultsFromItems, type PositionedPdfTextItem } from "./pdfExtract";

const reportLines = [
  "Test cycle NRTC",
  "Test date/time 2025/08/18 14:48:08",
  "Engine family [-] EC3.139TCI_STG-V",
  "Engine number [-] E2467585",
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
  "Tailpipe (EBH02) bench results - not driftcorrected",
  "Specific results Phase 1",
  "CH4 [g/kWh] 0.003",
  "CO2 [g/kWh] 1052.622",
  "COL [g/kWh] 0.286",
  "CO (COL - Tailpipe) [g/kWh] 0.286",
  "THC [g/kWh] 0.129",
  "NO2 (NOX,NO - Tailpipe) [g/kWh] 0.811",
  "NOX [g/kWh] 3.239",
  "NO [g/kWh] 1.605",
  "O2 [g/kWh] 1443.520",
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
    expect(rec.values.date).toBe("2025/08/18");
    expect(rec.values.engineModel).toBe("EC3.139TCI_STG-V");
    expect(rec.values.engineNumber).toBe("E2467585");
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

  it("extracts Tailpipe EBH02 Specific results and keeps them separate from EngineOut", () => {
    const rec = extractFromLines(reportLines, "2025_06_460_NRTC_WI_DOC.pdf", "NRTC");
    const details = rec.values.tailpipeDetails ?? "";
    for (const expected of [
      "CH4: 0.003 g/kWh",
      "CO2: 1052.622 g/kWh",
      "COL: 0.286 g/kWh",
      "CO (COL - Tailpipe): 0.286 g/kWh",
      "THC: 0.129 g/kWh",
      "NO2 (NOX,NO - Tailpipe): 0.811 g/kWh",
      "NOX: 3.239 g/kWh",
      "NO: 1.605 g/kWh",
      "O2: 1443.520 g/kWh",
    ]) expect(details).toContain(expected);
    expect(rec.values.engineOutCH4).toBe("-0.009");
    expect(rec.values.tailpipeCH4).toBe("0.003");
    expect(rec.values.tailpipeO2).toBe("1443.520");
  });

  it("keeps EBH01 and EBH02 separate when both bench headings appear on one page", () => {
    const items: PositionedPdfTextItem[] = [
      { page: 12, x: 10, y: 780, text: "EngineOut (EBH01) bench results - not driftcorrected" },
      { page: 12, x: 534, y: 730, text: "Specific results" },
      { page: 12, x: 538, y: 712, text: "CH4" },
      { page: 12, x: 580, y: 712, text: "[g/kWh]" },
      { page: 12, x: 630, y: 712, text: "-0.009" },
      { page: 12, x: 10, y: 560, text: "Tailpipe (EBH02) bench results - not driftcorrected" },
      { page: 12, x: 534, y: 530, text: "Specific results" },
      { page: 12, x: 538, y: 512, text: "CH4" },
      { page: 12, x: 580, y: 512, text: "[g/kWh]" },
      { page: 12, x: 630, y: 512, text: "0.003" },
      { page: 12, x: 7, y: 300, text: "Fuel consumption" },
    ];

    const engineOut = parseEngineOutSpecificResultsFromItems(items);
    const tailpipe = parseTailpipeSpecificResultsFromItems(items);
    expect(engineOut.engineOutCH4).toBe("-0.009");
    expect(tailpipe.tailpipeCH4).toBe("0.003");
  });

  it("uses coordinates to select the Tailpipe EBH02 table even when the PDF mentions EBH01 elsewhere", () => {
    const items: PositionedPdfTextItem[] = [
      { page: 12, x: 10, y: 780, text: "Device information: EBH01 also present elsewhere" },
      { page: 12, x: 10, y: 750, text: "Tailpipe (EBH02) bench results - not driftcorrected" },
      { page: 12, x: 534, y: 730, text: "Specific results" },
      { page: 12, x: 7, y: 500, text: "Fuel consumption" },
      { page: 12, x: 275, y: 712, text: "CH4" },
      { page: 12, x: 330, y: 712, text: "999.999" },
      { page: 12, x: 538, y: 712, text: "CH4" },
      { page: 12, x: 580, y: 712, text: "[g/kWh]" },
      { page: 12, x: 630, y: 712, text: "0.003" },
      { page: 12, x: 538, y: 702, text: "CO2" },
      { page: 12, x: 580, y: 702, text: "[g/kWh]" },
      { page: 12, x: 630, y: 702, text: "1052.622" },
      { page: 12, x: 538, y: 692, text: "COL" },
      { page: 12, x: 580, y: 692, text: "[g/kWh]" },
      { page: 12, x: 630, y: 692, text: "0.286" },
      { page: 12, x: 538, y: 682, text: "CO (COL - Tailpipe)" },
      { page: 12, x: 580, y: 682, text: "[g/kWh]" },
      { page: 12, x: 630, y: 682, text: "0.286" },
      { page: 12, x: 538, y: 672, text: "THC" },
      { page: 12, x: 580, y: 672, text: "[g/kWh]" },
      { page: 12, x: 630, y: 672, text: "0.129" },
      { page: 12, x: 538, y: 662, text: "NO2 (NOX,NO - Tailpipe)" },
      { page: 12, x: 580, y: 662, text: "[g/kWh]" },
      { page: 12, x: 630, y: 662, text: "0.811" },
      { page: 12, x: 538, y: 652, text: "NOX" },
      { page: 12, x: 580, y: 652, text: "[g/kWh]" },
      { page: 12, x: 630, y: 652, text: "3.239" },
      { page: 12, x: 538, y: 642, text: "NO" },
      { page: 12, x: 580, y: 642, text: "[g/kWh]" },
      { page: 12, x: 630, y: 642, text: "1.605" },
      { page: 12, x: 538, y: 632, text: "O2" },
      { page: 12, x: 580, y: 632, text: "[g/kWh]" },
      { page: 12, x: 630, y: 632, text: "1443.520" },
    ];
    const values = parseTailpipeSpecificResultsFromItems(items);
    expect(values.tailpipeCH4).toBe("0.003");
    expect(values.tailpipeCO2).toBe("1052.622");
    expect(values.tailpipeCOL).toBe("0.286");
    expect(values.tailpipeCO).toBe("0.286");
    expect(values.tailpipeTHC).toBe("0.129");
    expect(values.tailpipeNO2).toBe("0.811");
    expect(values.tailpipeNOX).toBe("3.239");
    expect(values.tailpipeNO).toBe("1.605");
    expect(values.tailpipeO2).toBe("1443.520");
    expect(values.tailpipeCH4).not.toBe("999.999");
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

  it("returns a clear error for a file that is not a PDF", async () => {
    const file = new File(["this is not a PDF"], "not-a-report.pdf", { type: "application/pdf" });
    const record = await extractPdf(file, "NRTC");
    expect(record.status).toBe("error");
    expect(record.message).toContain("valid PDF");
  });
});
