import { seedDatabase } from "../server/seed";

async function main() {
  const isProd = process.env.NODE_ENV === "production";
  await seedDatabase();
  if (!isProd) {
    console.log("Seed complete (local mode). SuperAdmin email: admin@orbia.app");
  } else {
    console.log("Seed complete.");
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
