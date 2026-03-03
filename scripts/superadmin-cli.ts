import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashPassword } from "../server/auth";
import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    const args = process.argv.slice(2);
    const isReset = args.includes("--reset");
    const force = args.includes("--force");

    try {
        const email = process.env.SUPERADMIN_EMAIL || await question("Email del SuperAdmin: ");
        if (!email) throw new Error("Email no proveído");

        // Check if another active super admin exists
        const [existing] = await db
            .select()
            .from(users)
            .where(and(eq(users.isSuperAdmin, true), isNull(users.deletedAt)))
            .limit(1);

        if (existing) {
            if (isReset) {
                if (existing.email.toLowerCase() !== email.toLowerCase()) {
                    console.warn(`[WARNING] Reseteando a un super admin diferente: ${existing.email} -> ${email}`);
                }
            } else if (!force) {
                throw new Error(`Ya existe un SuperAdmin activo (${existing.email}). Usá --reset para cambiar contraseña o --force para reemplazarlo (cuidado con constraint).`);
            }
        }

        const password = process.env.SUPERADMIN_PASSWORD || await question("Password del SuperAdmin: ");
        if (!password || password.length < 8) {
            throw new Error("Password no válido (mínimo 8 caracteres)");
        }

        const hashedPass = await hashPassword(password);

        if (existing && isReset) {
            console.log(`Reseteando password y (opcionalmente) email para admin actual ID: ${existing.id}...`);
            await db.update(users).set({
                email: email.toLowerCase(),
                password: hashedPass,
                tokenInvalidBefore: new Date()
            }).where(eq(users.id, existing.id));
            console.log("✅ Credenciales reseteadas correctamente. Sesiones previas cerradas.");
        } else {
            if (existing && force) {
                console.log(`Desactivando super admin anterior ID: ${existing.id}...`);
                await db.update(users).set({ deletedAt: new Date(), isActive: false }).where(eq(users.id, existing.id));
            }

            console.log(`Creando nuevo SuperAdmin (${email})...`);
            await db.insert(users).values({
                email: email.toLowerCase(),
                password: hashedPass,
                fullName: "System SuperAdmin",
                role: "super_admin",
                isSuperAdmin: true,
                isActive: true,
                tenantId: null as any
            });
            console.log("✅ SuperAdmin creado correctamente.");
        }

    } catch (err: any) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    } finally {
        rl.close();
        process.exit(0);
    }
}

main();
