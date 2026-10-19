#!/usr/bin/env node
"use strict";

// Creates a copy/paste EngineLab license key signed with the private issuer key.
// Keep engine-lab-license-private.pem secure and never send it to customers.
// Usage: node scripts/issue-license.cjs "Customer or Company" 1m|3m|6m|1y [license-id]
// Or provide an exact expiry date: YYYY-MM-DD.
// Optional key path: ENGINELAB_LICENSE_PRIVATE_KEY=/path/to/private.pem
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, sign } = require("node:crypto");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [customerArg, validityArg, licenseIdArg] = process.argv.slice(2);
if (!customerArg || !validityArg) {
  fail('Usage: node scripts/issue-license.cjs "Customer or Company" 1m|3m|6m|1y [license-id]');
}

const customer = customerArg.trim();
if (!customer) fail("Customer name cannot be blank.");

function expiryAtEndOfDay(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    fail("Expiry date must use YYYY-MM-DD, for example 2027-10-19.");
  }
  const date = new Date(dateString + "T23:59:59.999Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateString) {
    fail("Expiry date is not a real calendar date.");
  }
  return date;
}

function addCalendarMonthsFromToday(months) {
  const now = new Date();
  const targetMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDay);
  const dateString = [
    String(targetMonth.getUTCFullYear()).padStart(4, "0"),
    String(targetMonth.getUTCMonth() + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
  return expiryAtEndOfDay(dateString);
}

let expiry;
const durationMonths = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };
if (Object.prototype.hasOwnProperty.call(durationMonths, validityArg)) {
  expiry = addCalendarMonthsFromToday(durationMonths[validityArg]);
} else {
  expiry = expiryAtEndOfDay(validityArg);
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
process.stdout.write("ENGINELAB-1." + payloadToken + "." + signature + "\n");
