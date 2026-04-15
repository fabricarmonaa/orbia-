import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IStorageProvider, LocalStorageProvider, STORAGE_ROOT } from "./storage-provider";
import fs from "fs/promises";
import path from "path";

export class S3StorageProvider implements IStorageProvider {
  private s3: S3Client;
  private bucket: string;
  private localFallbackProvider: LocalStorageProvider;
  private cdnDomain: string | null;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || "";
    this.cdnDomain = process.env.AWS_CDN_DOMAIN || null;

    if (!this.bucket) {
      throw new Error(`[S3Provider] AWS_S3_BUCKET env var is not configured.`);
    }

    const s3Config: any = {
      region: process.env.AWS_REGION || "us-east-1",
    };

    if (process.env.AWS_S3_ENDPOINT) {
      s3Config.endpoint = process.env.AWS_S3_ENDPOINT;
      // Por defecto para Cloudflare R2, Minio, etc.
      s3Config.forcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === "true"; 
    }

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      s3Config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    this.s3 = new S3Client(s3Config);
    this.localFallbackProvider = new LocalStorageProvider(STORAGE_ROOT);
  }

  resolveAbsolutePath(relativePath: string): string {
    // En S3, return la clave (relativePath).
    // Si algún componente legacy asume formato FS absoluto, esto puede chocar si usan fs. 
    // Los consumers de IStorageProvider DEBEN usar methodos asíncronos del provider.
    // Usamos normalize de POSIX para consistencia en S3
    return relativePath.split(path.sep).join("/");
  }

  async fileExists(relativePath: string): Promise<boolean> {
    const key = this.resolveAbsolutePath(relativePath);
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        // Fallback local: verificar si el archivo existe en el legacy local storage para no quebrar persistencia antigua
        return this.localFallbackProvider.fileExists(relativePath);
      }
      return false;
    }
  }

  async saveFile(sourcePath: string, destinationRelativePath: string): Promise<void> {
    const key = this.resolveAbsolutePath(destinationRelativePath);
    const content = await fs.readFile(sourcePath);
    
    // Simplistic MIME detection based on extension for the S3 object metadata
    let contentType = "application/octet-stream";
    const ext = path.extname(destinationRelativePath).toLowerCase();
    if (ext === ".pdf") contentType = "application/pdf";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".webp") contentType = "image/webp";

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      // ACL: "public-read", // Opcional, dependiendo de si se usan signed URLs
    }));

    // Opcional: limpiar tmp del subidor
    // await fs.unlink(sourcePath).catch(() => {});
  }

  async deleteFile(relativePath: string): Promise<void> {
    const key = this.resolveAbsolutePath(relativePath);
    
    // S3 delete succeeds even if object not exists, which is safely idempotent.
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));

    // Intentar borrar en local silo existía para sanear migración
    await this.localFallbackProvider.deleteFile(relativePath).catch(() => {});
  }

  getPublicUrl(relativePath: string): string | null {
    const key = this.resolveAbsolutePath(relativePath);
    
    if (this.cdnDomain) {
      const cdnBase = this.cdnDomain.startsWith("http") ? this.cdnDomain : `https://${this.cdnDomain}`;
      return `${cdnBase}/${key}`;
    }

    // Default S3/R2 direct public URL (only valid if bucket is explicitly public)
    // Para URLs privadas debe definirse un método makePresignedUrl en el futuro o aquí mismo
    return `https://${this.bucket}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
  }

  /**
   * Extensión no estándar en la interfaz base todavía, 
   * pero util si queremos URLs firmadas.
   */
  async getPresignedUrl(relativePath: string, expiresInSec: number = 3600): Promise<string> {
    const key = this.resolveAbsolutePath(relativePath);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSec });
  }
}
