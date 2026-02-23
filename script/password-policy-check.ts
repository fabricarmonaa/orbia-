/* eslint-disable no-console */
import { evaluatePassword } from "../server/services/password-policy";
import { createRateLimiter } from "../server/middleware/rate-limit";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function testPasswordPolicy() {
  const weak = evaluatePassword("Fabri123", { dni: "12345678", tenantCode: "acme" });
  assert(!weak.isValid, "Fabri123 debe ser inválida");

  const strong = evaluatePassword("CorrectHorseBatteryStaple!!2026", { dni: "12345678", tenantCode: "acme" });
  assert(strong.isValid, "Passphrase fuerte debe ser válida");

  const containsDni = evaluatePassword("MiClaveSegura123!45678901", { dni: "45678901" });
  assert(!containsDni.isValid, "Password con DNI debe fallar");

  const common = evaluatePassword("Password123!", {});
  assert(!common.isValid, "Password123! debe fallar por común");
}

async function testRateLimit() {
  const limiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req: any) => `k:${req.ip}`,
    errorMessage: "limit",
    code: "RATE_LIMITED",
  });

  let blockedStatus = 0;
  for (let i = 0; i < 11; i++) {
    const req: any = { ip: "127.0.0.1", path: "/api/auth/login", headers: {}, body: {} };
    const res: any = {
      status(code: number) {
        blockedStatus = code;
        return this;
      },
      json(payload: any) {
        return payload;
      },
    };
    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });
    if (i < 10) assert(nextCalled, `Intento ${i + 1} debería pasar`);
  }
  assert(blockedStatus === 429, "Intento 11 debe devolver 429");
}

async function run() {
  await testPasswordPolicy();
  await testRateLimit();
  console.log("password-policy-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
