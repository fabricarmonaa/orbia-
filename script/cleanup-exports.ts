import fs from "fs";
import path from "path";

const exportsDir = path.join(process.cwd(), "uploads", "exports");
const maxAgeMs = 15 * 60 * 1000;

function run() {
  if (!fs.existsSync(exportsDir)) {
    console.log("No exports dir");
    return;
  }
  const now = Date.now();
  let removed = 0;
  for (const entry of fs.readdirSync(exportsDir)) {
    const full = path.join(exportsDir, entry);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  console.log(`Cleanup complete. Removed: ${removed}`);
}

run();
