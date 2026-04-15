import path from "path";
import fs from "fs/promises";
import fsSync from "fs";

/**
 * Abstracción de storage backend.
 *
 * Actualmente solo soporta almacenamiento local (disco del servidor).
 * El diseño de la interfaz permite agregar un provider S3/R2/GCS en el futuro
 * sin cambiar el código de los consumidores (attachment-storage, upload-guards, etc.).
 *
 * Para migrar a S3: implementar S3StorageProvider con las mismas firmas y cambiar
 * STORAGE_PROVIDER=s3 en las variables de entorno.
 */

// Directorio raíz de almacenamiento (único lugar donde se define para toda la app)
export const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.join(process.cwd(), "storage");

// Directorio raíz de uploads (logos, avatares, etc.)
export const UPLOADS_ROOT = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(process.cwd(), "uploads");

export interface IStorageProvider {
  /**
   * Devuelve la ruta absoluta de un archivo a partir de su path relativo.
   * Para el provider local es simplemente path.join(STORAGE_ROOT, relativePath).
   * Para S3 sería la key del objeto.
   */
  resolveAbsolutePath(relativePath: string): string;

  /**
   * Verifica si un archivo existe.
   */
  fileExists(relativePath: string): Promise<boolean>;

  /**
   * Mueve un archivo desde `sourcePath` (absoluto, temp) al destino relativo.
   */
  saveFile(sourcePath: string, destinationRelativePath: string): Promise<void>;

  /**
   * Elimina un archivo por su path relativo.
   */
  deleteFile(relativePath: string): Promise<void>;

  /**
   * Devuelve la URL pública de acceso a un archivo.
   * Para local, devuelve null (los archivos se sirven vía endpoint autenticado).
   * Para S3/R2, devuelve la URL del bucket.
   */
  getPublicUrl(relativePath: string): string | null;
}

/**
 * Implementación local: todos los archivos van al disco del servidor.
 * Compatible 100% con el comportamiento existente — no rompe archivos ya guardados.
 */
export class LocalStorageProvider implements IStorageProvider {
  private root: string;

  constructor(root: string = STORAGE_ROOT) {
    this.root = root;
  }

  resolveAbsolutePath(relativePath: string): string {
    // Prevenir path traversal
    const normalized = path.normalize(relativePath).replace(/^(\.\.([/\\]|$))+/, "");
    return path.join(this.root, normalized);
  }

  async fileExists(relativePath: string): Promise<boolean> {
    const absPath = this.resolveAbsolutePath(relativePath);
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  async saveFile(sourcePath: string, destinationRelativePath: string): Promise<void> {
    const destAbs = this.resolveAbsolutePath(destinationRelativePath);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.rename(sourcePath, destAbs);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const absPath = this.resolveAbsolutePath(relativePath);
    await fs.unlink(absPath);
  }

  getPublicUrl(_relativePath: string): string | null {
    // El storage local no tiene URLs públicas directas:
    // los archivos se sirven a través de endpoints autenticados.
    return null;
  }
}

// ─────────────────────────────────────────────
// Factory — singleton por proceso
// ─────────────────────────────────────────────
import { S3StorageProvider } from "./s3-provider";

let _provider: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (_provider) return _provider;

  const providerName = (process.env.STORAGE_PROVIDER || "local").toLowerCase().trim();

  if (providerName === "s3" || providerName === "r2") {
    _provider = new S3StorageProvider();
    return _provider;
  }

  if (providerName === "local") {
    _provider = new LocalStorageProvider(STORAGE_ROOT);
    return _provider;
  }

  throw new Error(
    `[storage-provider] STORAGE_PROVIDER="${providerName}" no está soportado. Valores válidos: "local", "s3", "r2".`
  );
}

/**
 * Resuelve un path absoluto de storage a partir de un path relativo.
 * Helper de conveniencia que usa el provider configurado.
 */
export function resolveStoragePath(relativePath: string): string {
  return getStorageProvider().resolveAbsolutePath(relativePath);
}

/**
 * Verifica si existe un archivo en el storage (sincrónico para backwards compat).
 * Usar `getStorageProvider().fileExists()` para la versión async.
 */
export function storageFileExistsSync(relativePath: string): boolean {
  const provider = getStorageProvider();
  if (provider instanceof LocalStorageProvider) {
    return fsSync.existsSync(provider.resolveAbsolutePath(relativePath));
  }
  // Para providers remotos solo es posible async — devolver false como fallback sync
  return false;
}
