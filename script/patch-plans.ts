import { db } from "../server/db";
import { plans } from "../shared/schema/plans";
import { eq, or } from "drizzle-orm";

async function run() {
    console.log("Patching Professional and Escala plans with new Agenda and Notes features...");
    const ps = await db.select().from(plans).where(or(eq(plans.planCode, 'PROFESIONAL'), eq(plans.planCode, 'ESCALA')));

    for (const p of ps) {
        const features: any = p.featuresJson || {};
        let changed = false;

        if (!features.agenda) {
            features.agenda = true;
            changed = true;
        }
        if (!features.notes) {
            features.notes = true;
            changed = true;
        }

        if (changed) {
            await db.update(plans).set({ featuresJson: features }).where(eq(plans.id, p.id));
            console.log(`Updated plan ${p.id} - ${p.name}`);
        } else {
            console.log(`Skipped plan ${p.id} - ${p.name} (already has features)`);
        }
    }

    console.log("Done.");
    process.exit(0);
}

run().catch(console.error);
