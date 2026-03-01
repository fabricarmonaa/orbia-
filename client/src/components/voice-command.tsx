import { useState, useCallback, useEffect, useRef } from "react";
import { apiRequest, registerSessionCleanup } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, Square, Loader2, Check, X, AlertCircle, Pencil, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export type VoiceContext = "orders" | "cash" | "products";

interface VoiceCommandProps {
  context: VoiceContext;
  onResult?: (data: any) => void;
  onCancel?: () => void;
}

interface SttResult {
  transcription: string;
  intent: any;
  context: string;
}

const INTENT_FIELDS: Record<string, { key: string; label: string; type: string }[]> = {
  orders: [
    { key: "customerName", label: "Cliente", type: "text" },
    { key: "customerPhone", label: "Teléfono", type: "text" },
    { key: "description", label: "Descripción", type: "text" },
    { key: "totalAmount", label: "Monto total", type: "number" },
  ],
  cash: [
    { key: "amount", label: "Monto", type: "number" },
    { key: "method", label: "Método", type: "text" },
    { key: "category", label: "Categoría", type: "text" },
    { key: "description", label: "Descripción", type: "text" },
  ],
  products: [
    { key: "name", label: "Nombre", type: "text" },
    { key: "price", label: "Precio", type: "number" },
    { key: "description", label: "Descripción", type: "text" },
    { key: "sku", label: "SKU", type: "text" },
  ],
};

export function VoiceCommand({ context, onResult, onCancel }: VoiceCommandProps) {
  const { hasFeature } = usePlan();
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [processing, setProcessing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<SttResult | null>(null);
  const [editedIntent, setEditedIntent] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const canUseSTT = hasFeature("stt");

  const handleStartRecording = useCallback(async () => {
    setError(null);
    try {

      if (!window.isSecureContext) {
        setError("El micrófono requiere HTTPS o localhost seguro.");
        return;
      }

      if (window.self !== window.top) {
        setError("El micrófono no se puede usar dentro de iframes.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Tu navegador no soporta captura de audio.");
        return;
      }
      const permissionsPolicy = (document as any).permissionsPolicy || (document as any).featurePolicy;
      if (permissionsPolicy?.allowsFeature && !permissionsPolicy.allowsFeature("microphone")) {
        setError("El navegador bloqueó el micrófono por política de permisos del sitio. Abrí Orbia en una pestaña normal (no embebido) y verificá que el servidor permita microphone.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,  // Mono
          sampleRate: 16000,  // 16kHz optimal for Whisper
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // Prefer webm/opus for smaller size, fallback to browser default
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/ogg',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType || undefined,
        audioBitsPerSecond: 24000,  // Low bitrate for voice
      });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (chunks.length === 0) {
          setError("No se recibió audio del navegador");
          setProcessing(false);
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setError("No se grabó audio");
          setProcessing(false);
          return;
        }

        setProcessing(true);
        console.debug("[stt] audio_blob", { size: blob.size, type: blob.type });
        try {
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          form.append("context", context);

          const res = await apiRequest("POST", "/api/ai/stt", form);
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            throw new Error("Respuesta inválida del backend (no JSON)");
          }
          const data = await res.json();
          const intentPayload = data?.data?.intent || {};
          const normalized = {
            transcription: data?.data?.transcript || "",
            intent: {
              intent: intentPayload?.name || "customer.search",
              entities: intentPayload?.entities || {},
              confidence: intentPayload?.confidence || 0,
              summary: intentPayload?.summary || "",
            },
            context,
          };
          console.debug("[stt] response", { ok: true, context, hasIntent: !!intentPayload?.name });
          setResult(normalized);
          setEditedIntent({ ...normalized.intent });
        } catch (err: any) {
          const msg = err?.message || "IA no disponible. Probá nuevamente en unos segundos.";
          setError(msg);
          toast({ title: "IA no disponible", description: msg, variant: "destructive" });
        } finally {
          setProcessing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError("El navegador bloqueó el micrófono por política de permisos del sitio. Abrí Orbia en una pestaña normal (no embebido) y verificá que el servidor permita microphone.");
        return;
      }
      setError("No se pudo acceder al micrófono. Verificá los permisos del navegador.");
    }
  }, [context]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try { mediaRecorder.requestData(); } catch {}
      mediaRecorder.stop();
      mediaRecorderRef.current = null;
      setRecording(false);
      setMediaRecorder(null);
    }
  }, [mediaRecorder]);

  const handleToggleRecording = useCallback(() => {
    if (recording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  }, [recording, handleStartRecording, handleStopRecording]);

  const handleApply = useCallback(async () => {
    if (!result) return;
    setApplying(true);
    try {
      const res = await apiRequest("POST", "/api/ai/apply", {
        context,
        intent: editedIntent,
      });
      const data = await res.json();

      const invalidateKeys: Record<string, string[]> = {
        orders: ["/api/orders", "/api/dashboard/stats"],
        cash: ["/api/cash/movements", "/api/cash/sessions", "/api/dashboard/stats"],
        products: ["/api/products", "/api/dashboard/stats"],
      };
      for (const key of invalidateKeys[context] || []) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }

      toast({
        title: "Comando aplicado",
        description: `Se creó el ${contextLabels[context]} correctamente.`,
      });
      onResult?.(data.data);
      setResult(null);
      setEditedIntent({});
      setEditing(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo aplicar el comando",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  }, [result, editedIntent, context, onResult, toast]);

  const handleRetry = useCallback(() => {
    setResult(null);
    setEditedIntent({});
    setError(null);
    setEditing(false);
  }, []);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditedIntent((prev) => ({ ...prev, [key]: value }));
  }, []);


  useEffect(() => {
    const stopVoiceResources = () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stop();
        } catch {
          // noop
        }
      }
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setMediaRecorder(null);
      setProcessing(false);
    };

    const unregister = registerSessionCleanup(stopVoiceResources);
    return () => {
      unregister();
      stopVoiceResources();
    };
  }, []);

  if (!canUseSTT) return null;

  const contextLabels: Record<VoiceContext, string> = {
    orders: "pedido",
    cash: "movimiento",
    products: "producto",
  };

  const fields = INTENT_FIELDS[context] || [];

  return (
    <div className="space-y-3" data-testid="voice-command-container">
      {!result && !error && (
        <div className="flex items-center gap-2">
          <Button
            variant={recording ? "destructive" : "outline"}
            size="sm"
            onClick={handleToggleRecording}
            disabled={processing}
            data-testid="button-voice-toggle"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Transcribiendo...
              </>
            ) : recording ? (
              <>
                <Square className="w-4 h-4 mr-1" />
                Detener
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-1" />
                Dictar {contextLabels[context]}
              </>
            )}
          </Button>
          {recording && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs text-muted-foreground">Grabando... hablá con claridad</span>
            </div>
          )}
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-voice-cancel">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {processing && !error && !result && (
        <p className="text-xs text-muted-foreground">Transcribiendo audio…</p>
      )}

      {error && (
        <Card className="border-destructive/30">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={handleRetry} data-testid="button-voice-retry">
                Reintentar
              </Button>
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-primary/30">
          <CardContent className="py-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Transcripción:</p>
              <p className="text-sm italic" data-testid="text-transcription">
                "{result.transcription}"
              </p>
            </div>

            {!editing ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-muted-foreground">Datos detectados:</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setEditing(true)}
                    data-testid="button-voice-edit"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5" data-testid="intent-tags">
                  {editedIntent && typeof editedIntent === "object" && !editedIntent.raw ? (
                    Object.entries(editedIntent)
                      .filter(([k]) => k !== "action")
                      .filter(([, v]) => v !== null && v !== undefined && v !== "")
                      .map(([key, val]) => (
                        <Badge key={key} variant="secondary" className="text-xs">
                          {formatIntentKey(key)}: {String(val)}
                        </Badge>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No se pudieron extraer datos estructurados
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2" data-testid="intent-edit-form">
                {fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <Label className="text-xs w-24 flex-shrink-0">{field.label}</Label>
                    <Input
                      type={field.type}
                      value={editedIntent[field.key] ?? ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className="h-8 text-sm"
                      data-testid={`input-intent-${field.key}`}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  data-testid="button-voice-done-edit"
                >
                  Listo
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleApply}
                disabled={applying}
                data-testid="button-voice-apply"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    Aplicar
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleRetry} data-testid="button-voice-retry">
                <Mic className="w-4 h-4 mr-1" />
                Reintentar
              </Button>
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={() => { setResult(null); setEditedIntent({}); setEditing(false); onCancel(); }}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatIntentKey(key: string): string {
  const map: Record<string, string> = {
    customerName: "Cliente",
    customerPhone: "Teléfono",
    description: "Descripción",
    totalAmount: "Monto",
    type: "Tipo",
    amount: "Monto",
    method: "Método",
    category: "Categoría",
    name: "Nombre",
    price: "Precio",
    cost: "Costo",
    stock: "Stock",
    sku: "SKU",
  };
  return map[key] || key;
}
