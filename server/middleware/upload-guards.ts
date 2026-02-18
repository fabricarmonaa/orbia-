import fs from "fs";
import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

const DEFAULT_MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || "2000000", 10);
const DEFAULT_LOGO_UPLOAD_BYTES = parseInt(process.env.MAX_LOGO_UPLOAD_BYTES || "1000000", 10);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const ALLOWED_EXTENSIONS = new Set(Object.values(MIME_EXTENSION_MAP).concat(".jpeg"));

export type UploadDirectory = "profiles" | "delivery" | "tenant-logos" | "app" | "avatars";

export class UploadValidationError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "UPLOAD_INVALID") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function resolveUploadDir(dir: UploadDirectory) {
  const uploadDir = path.join(process.cwd(), "uploads", dir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

export function resolveUploadMaxBytes(kind: "default" | "logo") {
  return kind === "logo" ? DEFAULT_LOGO_UPLOAD_BYTES : DEFAULT_MAX_UPLOAD_BYTES;
}

function validateFileMeta(file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.originalname.includes("..") || /[\\/]/.test(file.originalname)) {
    throw new UploadValidationError("Nombre de archivo inválido", 415, "UPLOAD_INVALID_NAME");
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new UploadValidationError("Extensión no permitida", 415, "UPLOAD_EXTENSION_NOT_ALLOWED");
  }
  const mappedExt = MIME_EXTENSION_MAP[file.mimetype];
  if (!mappedExt) {
    throw new UploadValidationError("Tipo de archivo no permitido", 415, "UPLOAD_MIME_NOT_ALLOWED");
  }
  if (ext !== mappedExt && !(mappedExt === ".jpg" && ext === ".jpeg")) {
    throw new UploadValidationError("Extensión y mime no coinciden", 415, "UPLOAD_MISMATCH");
  }
  return mappedExt;
}

export function createImageUpload(dir: UploadDirectory, kind: "default" | "logo") {
  const uploadDir = resolveUploadDir(dir);
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        try {
          const ext = validateFileMeta(file);
          const safeName = `${Date.now()}-${randomUUID()}${ext}`;
          cb(null, safeName);
        } catch (err) {
          cb(err as Error, "");
        }
      },
    }),
    limits: { fileSize: resolveUploadMaxBytes(kind) },
    fileFilter: (_req, file, cb) => {
      try {
        validateFileMeta(file);
        cb(null, true);
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

export function uploadErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Archivo demasiado grande", code: "UPLOAD_TOO_LARGE" });
    }
    return res.status(400).json({ error: "Error al subir archivo", code: "UPLOAD_ERROR" });
  }
  if (err instanceof UploadValidationError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  return next(err);
}

export function handleSingleUpload(upload: multer.Multer, field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(field)(req, res, (err: any) => {
      if (err) {
        return uploadErrorHandler(err, req, res, next);
      }
      return next();
    });
  };
}
