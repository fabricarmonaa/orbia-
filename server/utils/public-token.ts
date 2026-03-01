import { randomBytes } from "crypto";

export function generatePublicToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}
