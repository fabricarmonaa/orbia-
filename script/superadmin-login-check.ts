import fs from "fs";
const auth = fs.readFileSync("server/routes/auth.ts", "utf8");
if (auth.includes('Superadmin inválido: requiere tenant root')) throw new Error('still forcing root tenant for null-tenant superadmin');
if (!auth.includes('if (user?.tenantId)')) throw new Error('missing relaxed root validation');
console.log('superadmin-login-check: OK');
