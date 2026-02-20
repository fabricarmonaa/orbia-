import { strict as assert } from "assert";
import { isValidTenantSlug, normalizeTenantSlug, sanitizeTosContent } from "../server/services/tos";

function run() {
  assert.equal(normalizeTenantSlug("Mi Negocio Ñ"), "mi-negocio-n");
  assert.equal(isValidTenantSlug("mi-negocio-1"), true);
  assert.equal(isValidTenantSlug("slug con espacios"), false);

  const dirty = '<p>Hola</p><script>alert(1)</script><iframe src="x"></iframe><b onclick="x()">ok</b><img src=x />';
  const clean = sanitizeTosContent(dirty);
  assert.equal(clean.includes("<script>"), false);
  assert.equal(clean.includes("<iframe"), false);
  assert.equal(clean.includes("onclick"), false);
  assert.equal(clean.includes("<b>ok</b>"), true);
  assert.equal(clean.includes("<img"), false);

  console.log("TOS public checks passed");
}

run();
