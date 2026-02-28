import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env.production") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("No DATABASE_URL found.");
    process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

        const migrationsDir = path.join(__dirname, "..", "migrations");
        if (!fs.existsSync(migrationsDir)) {
            console.log("No migrations directory found.");
            return;
        }

        const files = fs.readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .sort();

        for (const file of files) {
            const { rows } = await client.query(
                "SELECT version FROM schema_migrations WHERE version = $1",
                [file]
            );

            if (rows.length === 0) {
                console.log(`Running migration: ${file}`);
                const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
                if (sql.trim()) {
                    // Wrap in exception block if needed, but standard query is fine
                    await client.query(sql);
                }
                await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
            } else {
                console.log(`Skipping applied migration: ${file}`);
            }
        }

        await client.query("COMMIT");
        console.log("All migrations applied successfully.");
    } catch (err: any) {
        await client.query("ROLLBACK");
        console.error(`Migration failed:`, err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
