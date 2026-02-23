import { spawn } from "node:child_process";

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://orbia:orbia_change_me@127.0.0.1:5432/orbia";

  await run("docker", ["compose", "up", "-d", "--build"]);
  await run("npx", ["tsx", "script/wait-for-postgres.ts"], { DATABASE_URL: databaseUrl });
  await run("npx", ["drizzle-kit", "push"], { DATABASE_URL: databaseUrl });
  await run("npx", ["tsx", "script/db-seed.ts"], { DATABASE_URL: databaseUrl });
  await run("docker", ["compose", "restart", "web"]);

  console.log("dev:docker OK -> http://127.0.0.1:5000");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
