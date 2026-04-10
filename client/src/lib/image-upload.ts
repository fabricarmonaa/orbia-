const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const COMPRESS_THRESHOLD_BYTES = 1.6 * 1024 * 1024;
const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.82;

export function validateUploadFile(file: File) {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera el límite de 12MB.");
  }
}

export function computeResizedDimensions(width: number, height: number, maxEdge = MAX_EDGE) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (Math.max(width, height) <= maxEdge) return { width, height };
  const ratio = width / height;
  if (width >= height) {
    return { width: maxEdge, height: Math.round(maxEdge / ratio) };
  }
  return { width: Math.round(maxEdge * ratio), height: maxEdge };
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo procesar la imagen."));
    };
    image.src = url;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("No se pudo comprimir la imagen."));
      resolve(blob);
    }, mimeType, quality);
  });
}

export async function optimizeImageFile(file: File) {
  if (!file.type.startsWith("image/")) return file;
  validateUploadFile(file);
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;

  const image = await readImage(file);
  const target = computeResizedDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
  if (!target.width || !target.height) return file;

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return file;

  ctx.drawImage(image, 0, 0, target.width, target.height);
  const preferredType = file.type === "image/png" ? "image/jpeg" : file.type;
  const blob = await canvasToBlob(canvas, preferredType, JPEG_QUALITY);
  if (blob.size >= file.size * 0.95) return file;

  const nextName = file.name.replace(/\.(png|jpg|jpeg|webp)$/i, ".jpg");
  return new File([blob], nextName, {
    type: blob.type,
    lastModified: Date.now(),
  });
}
