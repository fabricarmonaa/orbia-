import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth";
import { optimizeImageFile, validateUploadFile } from "@/lib/image-upload";

type UploadResult = {
  attachmentId: number;
  storageKey: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

type FileFieldInputProps = {
  orderId: number | string | "new";
  draftKey?: string;
  fieldDefinitionId: number;
  allowedExtensions?: string[];
  currentAttachmentId?: number | string | null;
  currentAttachmentName?: string | null;
  onUploadSuccess: (result: UploadResult) => void;
  onRemoveSuccess: () => void;
};

function parseAttachmentId(value: number | string | null | undefined, prefix: "att" | "draftatt") {
  const raw = String(value || "");
  const match = raw.match(new RegExp(`^${prefix}:(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export function FileFieldInput({
  orderId,
  draftKey,
  fieldDefinitionId,
  allowedExtensions = ["pdf", "jpg", "png", "jpeg"],
  currentAttachmentId,
  currentAttachmentName,
  onUploadSuccess,
  onRemoveSuccess,
}: FileFieldInputProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDraftMode = orderId === "new";
  const normalizedExtensions = allowedExtensions.map((ext) => String(ext || "").toLowerCase());
  const accept = [
    ...normalizedExtensions.map((ext) => `.${ext}`),
    "image/*",
    "application/pdf",
  ].join(",");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !normalizedExtensions.includes(ext)) {
      toast({
        title: "Archivo no permitido",
        description: `Solo se permiten extensiones: ${normalizedExtensions.join(", ")}`,
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (isDraftMode && !draftKey) {
      toast({
        title: "No se pudo preparar el adjunto",
        description: "Falta la sesión del formulario para guardar este archivo temporalmente.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const preparedFile = file.type.startsWith("image/") ? await optimizeImageFile(file) : file;
      if (preparedFile.type.startsWith("image/")) validateUploadFile(preparedFile);

      const formData = new FormData();
      formData.append("file", preparedFile);
      formData.append("fieldDefinitionId", String(fieldDefinitionId));
      if (isDraftMode && draftKey) {
        formData.append("draftKey", draftKey);
      }

      const url = isDraftMode
        ? "/api/orders/draft-attachments"
        : `/api/orders/${orderId}/attachments`;
      const res = await authFetch(url, {
        method: "POST",
        body: formData,
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Error al subir el archivo");
      }

      toast({ title: isDraftMode ? "Archivo preparado para el alta" : "Archivo subido correctamente" });
      onUploadSuccess(payload.data);
    } catch (err: any) {
      toast({
        title: "Falló la subida",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  async function handleRemove() {
    if (!currentAttachmentId) {
      onRemoveSuccess();
      return;
    }

    setIsRemoving(true);
    try {
      if (isDraftMode) {
        const draftAttachmentId = parseAttachmentId(currentAttachmentId, "draftatt");
        if (draftAttachmentId) {
          const query = draftKey ? `?draftKey=${encodeURIComponent(draftKey)}` : "";
          const res = await authFetch(`/api/orders/draft-attachments/${draftAttachmentId}${query}`, { method: "DELETE" });
          const payload = await res.json().catch(() => null);
          if (!res.ok) throw new Error(payload?.error?.message || "No se pudo eliminar el adjunto temporal");
        }
      } else {
        const attachmentId = parseAttachmentId(currentAttachmentId, "att");
        if (attachmentId) {
          const res = await authFetch(`/api/orders/${orderId}/attachments/${attachmentId}`, { method: "DELETE" });
          const payload = await res.json().catch(() => null);
          if (!res.ok) throw new Error(payload?.error?.message || "No se pudo eliminar el adjunto");
        }
      }

      onRemoveSuccess();
      toast({ title: isDraftMode ? "Adjunto quitado del alta" : "Archivo eliminado" });
    } catch (err: any) {
      toast({
        title: "No se pudo quitar el archivo",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  }

  const downloadUrl =
    !isDraftMode && currentAttachmentId
      ? `/api/orders/${orderId}/attachments/${String(currentAttachmentId).replace("att:", "")}`
      : null;

  async function handleDownload() {
    if (!downloadUrl) return;
    try {
      const resp = await authFetch(downloadUrl);
      if (!resp.ok) throw new Error("Archivo no encontrado");
      const blob = await resp.blob();
      const filenameMatch = resp.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/);
      let filename = filenameMatch ? filenameMatch[1] : currentAttachmentName || "archivo_adjunto";
      if (!filename.includes(".")) filename += ".bin";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch {
      toast({ title: "Error al descargar", variant: "destructive" });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {currentAttachmentId ? (
        <div className="flex items-center justify-between w-full border rounded-md p-2 bg-muted/30">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileIcon className="shrink-0 w-8 h-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentAttachmentName || "Archivo adjunto"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {isDraftMode ? "Listo para crear el pedido" : `ID: ${currentAttachmentId}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {!isDraftMode ? (
              <Button type="button" size="icon" variant="secondary" onClick={handleDownload} title="Descargar">
                <Download className="w-4 h-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={handleRemove}
              disabled={isRemoving}
              title="Eliminar archivo"
            >
              {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            className="w-full flex justify-center gap-2 border-dashed"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {isUploading ? "Subiendo..." : isDraftMode ? "Seleccionar archivo" : "Subir archivo"}
          </Button>
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={accept}
            capture={normalizedExtensions.some((ext) => ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) ? "environment" : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Extensiones permitidas: {normalizedExtensions.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
