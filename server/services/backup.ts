import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import util from "util";
import { getStorageProvider, LocalStorageProvider } from "./storage-provider";

const execAsync = util.promisify(exec);

export async function runDatabaseBackup(): Promise<string | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[Backup] DATABASE_URL no está configurada, ignorando volcado.");
    return null;
  }

  // Si usamos un LocalStorage, preferimos aislarlo en una carpeta de servidor
  const backupDir = path.join(process.cwd(), "storage", "backups");
  await fs.mkdir(backupDir, { recursive: true }).catch(() => {});

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `orbia_db_backup_${timestamp}.sql`;
  const filePath = path.join(backupDir, fileName);

  try {
    console.info(`[Backup] Iniciando volcado de BD hacia ${fileName}...`);
    // Ejecutar pg_dump. Se asume que pg_dump está instalado en el entorno de ejecución.
    await execAsync(`pg_dump "${databaseUrl}" -f "${filePath}" --clean --no-owner`);
    console.info(`[Backup] Volcado completado: ${fileName}`);

    // Rotación de Backups Locales (Mantener solo los últimos 7)
    await rotateBackups(backupDir, 7);

    // Si el provider es S3, también lo subimos a S3
    const provider = getStorageProvider();
    if (!(provider instanceof LocalStorageProvider)) {
        console.info(`[Backup] Sincronizando backup hacia Storage Externo...`);
        await provider.saveFile(filePath, `backups/${fileName}`);
        // Nota: en S3 deberíamos tener una policy de expiración, de lo contrario
        // se acumulan indefinidamente, o se implementa una rotación S3 custom.
    }

    return filePath;
  } catch (err: any) {
    console.error(`[Backup] Error durante el volcado de la BD:`, err?.message || err);
    return null;
  }
}

async function rotateBackups(directory: string, keepCount: number) {
  try {
    const files = await fs.readdir(directory);
    const backups = files
      .filter((f) => f.startsWith("orbia_db_backup_") && f.endsWith(".sql"))
      .sort((a, b) => b.localeCompare(a)); // Descendente (más nuevos primero)

    const toDelete = backups.slice(keepCount);
    for (const oldFile of toDelete) {
      await fs.unlink(path.join(directory, oldFile)).catch(() => {});
      console.info(`[Backup] Rotación: eliminado archivo viejo ${oldFile}`);
    }
  } catch (err) {
    console.error(`[Backup] Error durante rotación:`, err);
  }
}

let backupCron: NodeJS.Timeout | null = null;

export function startBackupScheduler(intervalMs: number = 24 * 60 * 60 * 1000) {
  if (backupCron) clearInterval(backupCron);
  
  if (process.env.ENABLE_AUTO_BACKUP !== "true") {
     console.info("[Backup] Auto Backup deshabilitado (ENABLE_AUTO_BACKUP no es true).");
     return;
  }

  console.info(`[Backup] Tarea periódica de backups iniciada (cada ${intervalMs} ms)`);
  // Ejecuta una vez al arrancar de forma asíncrona no bloqueante
  runDatabaseBackup().catch(console.error);

  backupCron = setInterval(() => {
    runDatabaseBackup().catch(console.error);
  }, intervalMs);
}
