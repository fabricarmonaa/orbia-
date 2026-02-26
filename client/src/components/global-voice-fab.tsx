import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";

type Status = "idle" | "recording" | "processing" | "error";

export function GlobalVoiceFab() {
  const { hasFeature } = usePlan();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [intent, setIntent] = useState("");
  const [entities, setEntities] = useState<Record<string, unknown>>({});
  const [summary, setSummary] = useState("");
  const [intentTicket, setIntentTicket] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);

  const enabled = hasFeature("stt");

  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === "recording" && seconds >= 14) mediaRef.current?.stop();
  }, [seconds, status]);

  const buttonLabel = useMemo(() => {
    if (!enabled) return "Voz disponible en plan Escala";
    if (status === "recording") return `Escuchando... ${seconds}s`;
    if (status === "processing") return "Procesando...";
    return "Comando por voz";
  }, [enabled, status, seconds]);

  const interpret = async (payload: { audio?: string; text?: string }) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 19000);
    try {
      const res = await apiRequest("POST", "/api/stt/interpret", payload, { signal: controller.signal });
      const json = await res.json();
      setTranscript(json.data.transcript || "");
      setIntent(json.data.intent || "");
      setEntities(json.data.entities || {});
      setSummary(json.data.summary || "");
      setIntentTicket(json.data.intentTicket || "");
      setOpen(true);
      setStatus("idle");
    } catch (err: any) {
      setStatus("error");
      toast({ title: err?.name === "AbortError" ? "Timeout" : "Error", description: err?.message || "No se pudo interpretar", variant: "destructive" });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const startRecording = async () => {
    try {
      setStatus("recording");
      setSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("processing");
        const blob = new Blob(chunks, { type: "audio/webm" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        bytes.forEach((b) => { binary += String.fromCharCode(b); });
        await interpret({ audio: btoa(binary) });
      };
      recorder.start();
    } catch {
      setStatus("error");
      toast({ title: "Error", description: "No se pudo iniciar el micrófono", variant: "destructive" });
    }
  };

  const execute = async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 19000);
    try {
      const res = await apiRequest("POST", "/api/stt/execute", {
        clientConfirmation: true,
        transcript,
        intent,
        entities,
        intentTicket,
      }, { signal: controller.signal });
      const json = await res.json();
      toast({ title: "Comando ejecutado", description: json.type === "navigation" ? "Abriendo resultado..." : "Listo" });
      if (json.type === "navigation" && json.navigation?.route) window.location.assign(json.navigation.route);
      setOpen(false);
    } catch (err: any) {
      toast({ title: err?.name === "AbortError" ? "Timeout" : "Error", description: err?.message || "No se pudo ejecutar", variant: "destructive" });
    } finally {
      window.clearTimeout(timer);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[70]">
        <Button aria-label="Comando por voz" onClick={status === "recording" ? () => mediaRef.current?.stop() : startRecording} disabled={!enabled || status === "processing"} title={buttonLabel} className="h-14 w-14 rounded-full shadow-lg">
          {status === "processing" ? <Loader2 className="h-5 w-5 animate-spin" /> : status === "recording" ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entendí esto, ¿confirmás?</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} />
            <pre className="rounded bg-muted p-2 text-xs overflow-auto">{JSON.stringify({ intent, entities }, null, 2)}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => interpret({ text: transcript })}>No, corregir</Button>
            <Button onClick={execute}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
