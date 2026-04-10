import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, FileIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth";
import { optimizeImageFile, validateUploadFile } from "@/lib/image-upload";
import { parseFileStorageTokens } from "@shared/order-fields";

export type MediaGroupItem = {
  storageKey: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

type MediaGroupFieldInputProps = {
  orderId: number | string | "new";
  draftKey?: string;
  fieldDefinitionId: number;
  allowedExtensions?: string[];
  acceptMode?: "images" | "mixed";
  maxFiles?: number;
  items: MediaGroupItem[];
  onChange: (items: MediaGroupItem[]) => void;
};

function isImageItem(item: MediaGroupItem) {
  return String(item.mimeType || "").startsWith("image/");
}

function getAttachmentIdFromStorageKey(storageKey: string) {
  return parseFileStorageTokens(storageKey)[0]?.id ?? null;
}

export function MediaGroupFieldInput({
  orderId,
  draftKey,
  fieldDefinitionId,
  allowedExtensions = ["pdf", "jpg", "png", "jpeg"],
  acceptMode = "mixed",
  maxFiles = 6,
  items,
  onChange,
}: MediaGroupFieldInputProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraftMode = orderId === "new";
  const normalizedExtensions = allowedExtensions.map((ext) => String(ext || "").toLowerCase());
  const acceptedMime = acceptMode === "images" ? "image/*" : undefined;

  const gridColumns = useMemo(() => {
    if (maxFiles >= 6) return "grid-cols-2 xl:grid-cols-3";
    if (maxFiles >= 4) return "grid-cols-2";
    return "grid-cols-1 sm:grid-cols-2";
  }, [maxFiles]);

  function buildPreviewUrl(item: MediaGroupItem) {
    const attachmentId = getAttachmentIdFromStorageKey(item.storageKey);
    if (!attachmentId) return null;
    if (item.storageKey.startsWith("draftatt:")) {
      const query = draftKey ? `?draftKey=${encodeURIComponent(draftKey)}` : "";
      return `/api/orders/draft-attachments/${attachmentId}${query}`;
    }
    return `/api/orders/${orderId}/attachments/${attachmentId}`;
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (isDraftMode && !draftKey) {
      toast({ title: "No se pudo preparar la carga", description: "Falta la sesión del formulario.", variant: "destructive" });
      return;
    }
    if (items.length >= maxFiles) {
      toast({ title: "Límite alcanzado", description: `Este bloque permite hasta ${maxFiles} archivo(s).`, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const availableSlots = maxFiles - items.length;
      const nextFiles = files.slice(0, availableSlots);
      const uploaded: MediaGroupItem[] = [];

      for (const file of nextFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !normalizedExtensions.includes(ext)) {
          throw new Error(`Solo se permiten: ${normalizedExtensions.join(", ")}`);
        }

        const preparedFile = file.type.startsWith("image/") ? await optimizeImageFile(file) : file;
        if (preparedFile.type.startsWith("image/")) validateUploadFile(preparedFile);

        const formData = new FormData();
        formData.append("file", preparedFile);
        formData.append("fieldDefinitionId", String(fieldDefinitionId));
        if (isDraftMode && draftKey) formData.append("draftKey", draftKey);

        const res = await authFetch(
          isDraftMode ? "/api/orders/draft-attachments" : `/api/orders/${orderId}/attachments`,
          { method: "POST", body: formData },
        );
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error?.message || "No se pudo subir el archivo");

        uploaded.push({
          storageKey: payload.data.storageKey || `att:${payload.data.attachmentId}`,
          originalName: payload.data.originalName || preparedFile.name,
          mimeType: payload.data.mimeType || preparedFile.type || null,
          sizeBytes: payload.data.sizeBytes || preparedFile.size || null,
        });
      }

      onChange([...items, ...uploaded]);
      toast({ title: uploaded.length > 1 ? "Archivos cargados" : "Archivo cargado" });
    } catch (err: any) {
      toast({ title: "Falló la carga", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(item: MediaGroupItem) {
    const attachmentId = getAttachmentIdFromStorageKey(item.storageKey);
    if (!attachmentId) return;
    setRemovingKey(item.storageKey);
    try {
      const query = draftKey ? `?draftKey=${encodeURIComponent(draftKey)}` : "";
      const url = item.storageKey.startsWith("draftatt:")
        ? `/api/orders/draft-attachments/${attachmentId}${query}`
        : `/api/orders/${orderId}/attachments/${attachmentId}`;
      const res = await authFetch(url, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error?.message || "No se pudo eliminar el archivo");
      onChange(items.filter((current) => current.storageKey !== item.storageKey));
      toast({ title: "Archivo eliminado" });
    } catch (err: any) {
      toast({ title: "No se pudo quitar", description: err.message, variant: "destructive" });
    } finally {
      setRemovingKey(null);
    }
  }

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${gridColumns}`}>
        {items.map((item, index) => {
          const previewUrl = buildPreviewUrl(item);
          const isImage = isImageItem(item) && previewUrl;
          return (
            <div key={item.storageKey} className="rounded-lg border bg-muted/20 p-3 space-y-3">
              {isImage ? (
                <a href={previewUrl || "#"} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-md border aspect-square bg-black/5">
                  <img src={previewUrl || ""} alt={item.originalName || "Imagen"} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="flex h-28 items-center justify-center rounded-md border bg-background">
                  <FileIcon className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              <div className="space-y-1">
                <p className="truncate text-sm font-medium">{item.originalName || "Archivo"}</p>
                <p className="text-xs text-muted-foreground">
                  {isImage ? "Imagen" : "Archivo"} {item.sizeBytes ? `· ${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB` : ""}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button type="button" variant="destructive" size="icon" disabled={removingKey === item.storageKey} onClick={() => void handleRemove(item)}>
                  {removingKey === item.storageKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length < maxFiles ? (
        <div className="space-y-2">
          <Button type="button" variant="outline" className="w-full justify-center gap-2 border-dashed" disabled={isUploading} onClick={() => inputRef.current?.click()}>
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isUploading ? "Subiendo..." : `Agregar ${acceptMode === "images" ? "fotos" : "archivos"}`}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={[acceptedMime, ...normalizedExtensions.map((ext) => `.${ext}`)].filter(Boolean).join(",")}
            onChange={handleFilesSelected}
          />
          <p className="text-xs text-muted-foreground">
            Podés cargar hasta {maxFiles} archivo(s). Formatos permitidos: {normalizedExtensions.join(", ")}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
