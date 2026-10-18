export const LICENSE_STORAGE_KEY = "enginelab.license.v1";

export interface EngineLabLicense {
  version: 1;
  product: "EngineLab";
  licenseId: string;
  customer: string;
  issuedAt: string;
  expiresAt: string;
}

export type LicenseState =
  | { status: "valid"; license: EngineLabLicense }
  | { status: "missing" | "invalid" | "expired"; message: string; license?: EngineLabLicense };

interface SignedLicenseEnvelope {
  payload: string;
  signature: string;
}

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm9WMo7VP2Rxp15yl1rGR
xRUDymQITosbwXySUODfE3TIr74KM0/xtlE69zLoVLIQgU0QLTPJAWT0bHyGJPcZ
y7nPG4dHXn9O5KWJjaUOM2Zg4pnS+FPI4T6VB2EYt+9lXj8lwqqWOoovjZdkq7Z/
E/bqTVScAX4KNKLiaYWY1W9NVR7cKDsMmOnvoZ0IX47m5RmdNgs6RgR6zysn/mle
uWllOtGwhufSVbkC+McpPhbi7x0JhKlX1iJTBgg8b+zLObTEPWq2Gq8SEt/7faaW
oXi2kWdBU7jttA4cO3kCIUrlxLFG6U6/WxFvXI1eoJl4B4ZLA1l0LPEWYyZNhSxY
0QIDAQAB
-----END PUBLIC KEY-----`;

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(result).set(bytes);
  return result;
}

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return exactArrayBuffer(bytes);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  return fromBase64Url(base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));
}

function isLicensePayload(value: unknown): value is EngineLabLicense {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<EngineLabLicense>;
  return p.version === 1 &&
    p.product === "EngineLab" &&
    typeof p.licenseId === "string" && p.licenseId.trim().length > 0 &&
    typeof p.customer === "string" && p.customer.trim().length > 0 &&
    typeof p.issuedAt === "string" && Number.isFinite(Date.parse(p.issuedAt)) &&
    typeof p.expiresAt === "string" && Number.isFinite(Date.parse(p.expiresAt));
}

/** Verify an offline license file signed by the EngineLab issuer key. */
export async function verifyLicenseText(text: string): Promise<LicenseState> {
  if (!text.trim()) return { status: "missing", message: "A license file is required to unlock EngineLab." };

  try {
    const envelope = JSON.parse(text) as Partial<SignedLicenseEnvelope>;
    if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
      return { status: "invalid", message: "The license file format is not valid." };
    }

    const cryptoApi = globalThis.crypto?.subtle;
    if (!cryptoApi) return { status: "invalid", message: "License verification is unavailable in this environment." };

    const key = await cryptoApi.importKey(
      "spki",
      pemToArrayBuffer(LICENSE_PUBLIC_KEY_PEM),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = fromBase64Url(envelope.signature);
    const message = exactArrayBuffer(new TextEncoder().encode(envelope.payload));
    const isSignatureValid = await cryptoApi.verify("RSASSA-PKCS1-v1_5", key, signature, message);
    if (!isSignatureValid) return { status: "invalid", message: "This license signature is invalid or the file was changed." };

    const payloadText = new TextDecoder().decode(fromBase64Url(envelope.payload));
    const payload: unknown = JSON.parse(payloadText);
    if (!isLicensePayload(payload)) {
      return { status: "invalid", message: "The license is missing required EngineLab fields." };
    }

    if (Date.now() > Date.parse(payload.expiresAt)) {
      return { status: "expired", message: "This EngineLab license has expired. Please activate a renewed license.", license: payload };
    }

    if (Date.now() < Date.parse(payload.issuedAt)) {
      return { status: "invalid", message: "This license is not active yet. Check your computer date or the license start date.", license: payload };
    }

    return { status: "valid", license: payload };
  } catch {
    return { status: "invalid", message: "Could not read or verify this license file. Please select the original license JSON." };
  }
}
