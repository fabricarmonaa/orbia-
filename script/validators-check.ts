import { isValidEmail, isValidPhone } from "../shared/validation/contact";

function assert(name: string, value: boolean) {
  if (!value) throw new Error(`Assertion failed: ${name}`);
}

function main() {
  assert("phone accepts +54", isValidPhone("+54 11 1234-5678"));
  assert("phone rejects text", !isValidPhone("abcde"));
  assert("email valid", isValidEmail("nombre@dominio.com", true));
  assert("email blocks g.com in strict", !isValidEmail("x@g.com", true));
  console.log("validators-check: OK");
}

main();
