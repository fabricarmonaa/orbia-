import fs from "fs";
const route = fs.readFileSync("server/routes/sales.ts", "utf8");
const storage = fs.readFileSync("server/storage/sales.ts", "utf8");
if (!route.includes('hasBranchesFeature')) throw new Error('missing central branch handling in route');
if (!storage.includes('Boolean(input.hasBranchesFeature)')) throw new Error('missing central branch handling in storage');
console.log("pos-central-branch-check: OK");
