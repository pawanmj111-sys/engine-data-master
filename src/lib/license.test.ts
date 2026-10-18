import { describe, expect, it } from "vitest";
import { verifyLicenseText } from "./license";

describe("EngineLab license validation", () => {
  it("reports an empty license as missing", async () => {
    await expect(verifyLicenseText("")).resolves.toMatchObject({ status: "missing" });
  });

  it("rejects malformed license JSON", async () => {
    await expect(verifyLicenseText("{ not a license")).resolves.toMatchObject({ status: "invalid" });
  });

  it("rejects JSON that does not contain a signed license envelope", async () => {
    await expect(verifyLicenseText(JSON.stringify({ customer: "Demo" }))).resolves.toMatchObject({ status: "invalid" });
  });
});
