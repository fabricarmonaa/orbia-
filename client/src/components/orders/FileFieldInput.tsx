import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileIcon, Trash2, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

type FileFieldInputProps = {
    orderId: number | string | "new";
    fieldDefinitionId: number;
    allowedExtensions?: string[];
    currentAttachmentId?: number | string | null;
    onUploadSuccess: (attachmentId: number) => void;
    onRemove: () => void;
};

export function FileFieldInput({
    orderId,
    fieldDefinitionId,
    allowedExtensions = ["pdf", "jpg", "png", "jpeg"],
    currentAttachmentId,
    onUploadSuccess,
    onRemove,
}: FileFieldInputProps) {
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Local extension check
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !allowedExtensions.includes(ext)) {
            toast({
                title: "Archivo no permitido",
                description: `Solo se permiten extensiones: ${allowedExtensions.join(", ")}`,
                variant: "destructive",
            });
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        if (orderId === "new") {
            toast({
                title: "Primero guardá el pedido",
                description: "Para subir archivos, primero tenés que crear el pedido. Crealo sin el archivo y luego editalo.",
                variant: "destructive",
            });
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("fieldDefinitionId", String(fieldDefinitionId));

            // We need native fetch with the Auth token because apiJson sets Content-Type to application/json usually
            // However, we can use the app's apiJson if it doesn't hardcode it, but since we are sending FormData, 
            // fetch must NOT override the Content-Type (browser sets it with boundary).
            const token = getToken();
            const res = await fetch(`/api/orders/${orderId}/attachments`, {
                method: "POST",
                body: formData,
                headers: {
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                },
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.error?.message || "Error al subir el archivo");
            }

            const { data } = await res.json();
            toast({ title: "Archivo subido correctamente" });
            onUploadSuccess(data.attachmentId);
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

    const downloadUrl =
        currentAttachmentId && orderId !== "new"
            ? `/api/orders/${orderId}/attachments/${String(currentAttachmentId).replace("att:", "")}`
            : null;

    async function handleDownload() {
        if (!downloadUrl) return;
        const token = getToken();
        try {
            const resp = await fetch(downloadUrl, {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (!resp.ok) throw new Error("File not found");
            const blob = await resp.blob();
            const filenameMatch = resp.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/);
            let filename = filenameMatch ? filenameMatch[1] : "archivo_adjunto";
            if (!filename.includes(".")) filename += ".bin"; // Fallback ext

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
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
                            <p className="text-sm font-medium truncate">Archivo Adjunto</p>
                            <p className="text-xs text-muted-foreground truncate">ID: {currentAttachmentId}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" size="icon" variant="secondary" onClick={handleDownload} title="Descargar">
                            <Download className="w-4 h-4" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            onClick={() => {
                                if (confirm("¿Seguro que querés eliminar el archivo actual? Esto requerirá volver a subir otro si es obligatorio.")) {
                                    // Actually delete the file via API if we want, or just let order update remove the linkage.
                                    // By UX usually we remove linkage, BUT we should probably do real delete or just unlink.
                                    // Since the instructions said "onRemove", let the parent decide or handle it in the next order submit.
                                    onRemove();
                                }
                            }}
                            title="Eliminar ref"
                        >
                            <Trash2 className="w-4 h-4" />
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
                        {isUploading ? "Subiendo..." : orderId === "new" ? "Guardá el pedido para subir" : "Subir archivo"}
                    </Button>
                    <input
                        type="file"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept={allowedExtensions.map((e) => `.${e}`).join(",")}
                    />
                    <p className="text-xs text-muted-foreground">
                        Extensiones permitidas: {allowedExtensions.join(", ")}
                    </p>
                </div>
            )}
        </div>
    );
}
