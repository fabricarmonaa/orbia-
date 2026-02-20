import fs from "fs";
const seed = fs.readFileSync("server/seed.ts", "utf8");
if (!seed.includes('planCode: "ESCALA"')) throw new Error('ESCALA seed missing');
if (!seed.includes('max_branches: 20')) throw new Error('ESCALA max_branches must be 20');
if (!seed.includes('max_staff_per_branch: 10')) throw new Error('ESCALA max_staff_per_branch must be 10');
console.log('plan-limits-check: OK');
