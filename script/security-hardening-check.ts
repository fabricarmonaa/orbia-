import assert from "node:assert/strict";
import fs from "node:fs";
import { sanitizeLongText, sanitizeShortText, escapeLikePattern } from "../server/security/sanitize";

const xssPayload = "<script>alert(1)</script> Pedido";
const sanitizedShort = sanitizeShortText(xssPayload, 120);
assert.equal(sanitizedShort.includes("<script>"), false);
assert.equal(sanitizedShort.includes("alert(1)"), true);

const longWithLines = "<img src=x onerror=alert(1)>Linea 1\n\nLinea 2";
const sanitizedLong = sanitizeLongText(longWithLines, 200);
assert.equal(sanitizedLong.includes("<img"), false);
assert.equal(sanitizedLong.includes("Linea 1\n\nLinea 2"), true);

assert.equal(escapeLikePattern("100%_match\\test"), "100\\%\\_match\\\\test");

const chartFile = fs.readFileSync("client/src/components/ui/chart.tsx", "utf8");
assert.equal(chartFile.includes("dangerouslySetInnerHTML"), false);

const usersStorage = fs.readFileSync("server/storage/users.ts", "utf8");
assert.equal(/eq\(users\.email, email\)/.test(usersStorage), true);
assert.equal(usersStorage.includes("SELECT * FROM users WHERE"), false);

console.log("Security hardening checks passed");
