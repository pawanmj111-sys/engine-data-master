#!/usr/bin/env node
"use strict";

// Creates an offline EngineLab license signed with the private issuer key.
// Keep engine-lab-license-private.pem outside the application repository.
// Usage: node scripts/issue-license.cjs "Customer or Company" YYYY-MM-DD [license-id]
// Optional key path: ENGINELAB_LICENSE_PRIVATE_KEY=/path/to/private.pem
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, sign } = require("node:crypto");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [customerArg, expiryDate, licenseIdArg] = process.argv.slice(2);
if (!customerArg || !expiryDate) {
  fail('Usage: node scripts/issue-license.cjs "Customer or Company" YYYY-MM-DD [license-id]');
}

const customer = customerArg.trim();
if (!customer) fail("Customer name cannot be blank.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
  fail("Expiry date must use YYYY-MM-DD, for example 2027-10-19.");
}
const expiry = new Date(expiryDate + "T23:59:59.999Z");
if (!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== expiryDate) {
  fail("Expiry date is not a real calendar date.");
}

const privateKeyPath = process.env.ENGINELAB_LICENSE_PRIVATE_KEY ||
  path.resolve(process.cwd(), "engine-lab-license-private.pem");
if (!fs.existsSync(privateKeyPath)) {
  fail("Private key not found at " + privateKeyPath +
    ". Put engine-lab-license-private.pem in the current directory or set ENGINELAB_LICENSE_PRIVATE_KEY.");
}

const payload = {
  version: 1,
  product: "EngineLab",
  licenseId: licenseIdArg || randomUUID(),
  customer,
  issuedAt: new Date().toISOString(),
  expiresAt: expiry.toISOString(),
};
const payloadToken = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
const privateKey = fs.readFileSync(privateKeyPath, "utf8");
const signature = sign("RSA-SHA256", Buffer.from(payloadToken, "utf8"), privateKey).toString("base64url");
const license = { payload: payloadToken, signature };
process.stdout.write(JSON.stringify(license, null, 2) + "\n");
