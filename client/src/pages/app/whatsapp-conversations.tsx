import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, getToken } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS = ["OPEN", "PENDING_CUSTOMER", "PENDING_BUSINESS", "WAITING_INTERNAL", "RESOLVED", "CLOSED"] as const;
const USAGE_FILTER_OPTIONS = ["all", "greeting", "follow_up", "reengagement", "confirmation", "reminder", "quote_or_budget", "handoff_human", "error_fallback", "closing", "custom"] as const;

type StreamStatus = "connecting" | "live" | "reconnecting" | "offline";

export default function WhatsappConversationsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [addonEnabled, setAddonEnabled] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [templateSuggestions, setTemplateSuggestions] = useState<any[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState("hello_world");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [lastRealtimeAt, setLastRealtimeAt] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [customerMatches, setCustomerMatches] = useState<any[]>([]);
  const [customerCreateName, setCustomerCreateName] = useState("");
  const [ownerMode, setOwnerMode] = useState("human");
  const [handoffStatus, setHandoffStatus] = useState("none");
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationPausedReason, setAutomationPausedReason] = useState("");
  const [templateUsageFilter, setTemplateUsageFilter] = useState("all");

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const currentSelectedIdRef = useRef<number | null>(null);

  useEffect(() => {
    currentSelectedIdRef.current = selected?.id ?? null;
  }, [selected?.id]);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime()),
    [conversations],
  );

  function upsertConversation(conversation: any) {
    setConversations((prev: any[]) => {
      const idx = prev.findIndex((item) => item.id === conversation.id);
      if (idx === -1) return [conversation, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...conversation };
      return next;
    });
    setSelected((prev: any) => {
      if (prev?.id !== conversation.id) return prev;
      const merged = { ...prev, ...conversation };
      setOwnerMode(merged.ownerMode || "human");
      setHandoffStatus(merged.handoffStatus || "none");
      setAutomationEnabled(Boolean(merged.automationEnabled));
      setAutomationPausedReason(merged.automationPausedReason || "");
      return merged;
    });
  }

  function upsertMessage(message: any) {
    if (!message || currentSelectedIdRef.current !== message.conversationId) return;
    setMessages((prev: any[]) => {
      const idx = prev.findIndex((item) => item.id === message.id || (item.providerMessageId && item.providerMessageId === message.providerMessageId));
      if (idx === -1) return [...prev, message];
      const next = [...prev];
      next[idx] = { ...next[idx], ...message };
      return next;
    });
  }

  function handleRealtimeEvent(payload: any) {
    if (!payload || !payload.eventType) return;
    if (payload.conversation) upsertConversation(payload.conversation);
    if (payload.message) upsertMessage(payload.message);
    setLastRealtimeAt(new Date().toISOString());
  }

  async function loadConversations() {
    const res = await apiRequest("GET", "/api/whatsapp/conversations");
    const data = await res.json();
    setConversations(data.data || []);
  }

  async function loadUsers() {
    try {
      const res = await apiRequest("GET", "/api/branch-users");
      const data = await res.json();
      setUsers(data.data || []);
    } catch {
      setUsers([]);
    }
  }

  async function loadTemplateSuggestions(conversationId: number) {
    try {
      const query = templateUsageFilter !== "all" ? `?usageType=${encodeURIComponent(templateUsageFilter)}` : "";
      const res = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/template-suggestions${query}`);
      const data = await res.json();
      setTemplateSuggestions(data.data || []);
    } catch {
      setTemplateSuggestions([]);
    }
  }

  async function loadMessages(conversationId: number) {
    const res = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/messages`);
    const data = await res.json();
    setMessages(data.data || []);
    if (data.conversation) {
      setSelected(data.conversation);
      setOwnerMode(data.conversation.ownerMode || "human");
      setHandoffStatus(data.conversation.handoffStatus || "none");
      setAutomationEnabled(Boolean(data.conversation.automationEnabled));
      setAutomationPausedReason(data.conversation.automationPausedReason || "");
    }
  }

  async function loadTimeline(conversationId: number) {
    try {
      const res = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/timeline`);
      const data = await res.json();
      setTimeline(data.data || []);
    } catch {
      setTimeline([]);
    }
  }

  async function loadCustomerMatches(conversationId: number) {
    try {
      const res = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/customer-matches`);
      const data = await res.json();
      setCustomerMatches(data.data || []);
    } catch {
      setCustomerMatches([]);
    }
  }

  async function refreshAll() {
    try {
      const res = await apiRequest("GET", "/api/addons/status");
      const json = await res.json();
      const enabled = Boolean(json?.data?.whatsapp_inbox);
      setAddonEnabled(enabled);
      if (!enabled) {
        setConversations([]);
        setMessages([]);
        setSelected(null);
        return;
      }
      await Promise.all([loadConversations(), loadUsers()]);
    } catch (err: any) {
      if (!String(err?.message || "").includes("addon")) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
      setAddonEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusyAction("send");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/messages/send`, { text: reply.trim() }, { skipAuthHandling: true });
      toast({ title: "Mensaje enviado" });
      setReply("");
    } catch (err: any) {
      const msg = String(err?.message || "Error enviando mensaje");
      const friendly = msg.includes("24h") ? `${msg} (Sugerencia: enviar plantilla desde esta misma pantalla)` : msg;
      toast({ title: "Error enviando", description: friendly, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function sendTemplateReply() {
    if (!selected || !selectedTemplateCode) return;
    setBusyAction("send-template");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/messages/send-template`, { templateCode: selectedTemplateCode }, { skipAuthHandling: true });
      toast({ title: "Plantilla enviada" });
    } catch (err: any) {
      toast({ title: "Error enviando plantilla", description: String(err?.message || "Error"), variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function markRead() {
    if (!selected) return;
    setBusyAction("mark-read");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/mark-read`, {});
      toast({ title: "Conversación marcada como leída" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function changeStatus(status: string) {
    if (!selected) return;
    setBusyAction("status");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/status`, { status });
      toast({ title: "Estado actualizado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function assignConversation(assignedUserId: string) {
    if (!selected) return;
    setBusyAction("assign");
    try {
      const payload = { assignedUserId: assignedUserId === "none" ? null : Number(assignedUserId) };
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/assign`, payload);
      toast({ title: "Asignación actualizada" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function updateOperationalState(patch: Record<string, unknown>) {
    if (!selected) return;
    setBusyAction("ops-state");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/operational-state`, patch);
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "No se pudo actualizar"), variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function linkCustomer(customerId: number) {
    if (!selected) return;
    setBusyAction("link-customer");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/link-customer`, { customerId });
      toast({ title: "Cliente vinculado" });
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "No se pudo vincular"), variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function createCustomerFromConversation() {
    if (!selected) return;
    setBusyAction("create-customer");
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/create-customer`, { name: customerCreateName || undefined });
      setCustomerCreateName("");
      toast({ title: "Cliente creado y vinculado" });
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "No se pudo crear cliente"), variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!selected?.id) return;
    loadTemplateSuggestions(selected.id);
  }, [templateUsageFilter, selected?.id]);

  useEffect(() => {
    if (!addonEnabled) return;
    const token = getToken();
    if (!token) return;

    let closedByCleanup = false;

    const closeStream = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const connect = () => {
      closeStream();
      const source = new EventSource(`/api/whatsapp/inbox/stream?access_token=${encodeURIComponent(token)}`);
      eventSourceRef.current = source;
      setStreamStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");

      source.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStreamStatus("live");
      };

      source.addEventListener("heartbeat", () => setLastRealtimeAt(new Date().toISOString()));
      source.onmessage = (event) => {
        try {
          handleRealtimeEvent(JSON.parse(event.data));
        } catch {
          // noop
        }
      };

      source.onerror = () => {
        closeStream();
        if (closedByCleanup) return;
        reconnectAttemptRef.current += 1;
        setStreamStatus("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, Math.min(8000, 1000 * reconnectAttemptRef.current));
      };

      for (const eventType of ["conversation.created", "conversation.updated", "conversation.read", "conversation.assigned", "conversation.status_changed", "message.created", "message.status_updated"]) {
        source.addEventListener(eventType, (event) => {
          try {
            handleRealtimeEvent(JSON.parse((event as MessageEvent).data));
          } catch {
            // noop
          }
        });
      }
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      closeStream();
      setStreamStatus("offline");
    };
  }, [addonEnabled]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Cargando inbox de WhatsApp…</div>;
  if (!addonEnabled) return <div className="p-6 text-sm text-muted-foreground">El addon <code>whatsapp_inbox</code> no está habilitado para este tenant.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WhatsApp Inbox</h1>
        <div className="flex items-center gap-2">
          <Badge variant={streamStatus === "live" ? "secondary" : "outline"}>{streamStatus}</Badge>
          <span className="text-xs text-muted-foreground">{lastRealtimeAt ? new Date(lastRealtimeAt).toLocaleTimeString() : "Sin eventos"}</span>
          <Button variant="outline" onClick={refreshAll}>Refrescar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><h2 className="font-semibold">Conversaciones ({sortedConversations.length})</h2></CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-auto">
            {sortedConversations.map((c) => (
              <button key={c.id} onClick={() => { setSelected(c); loadMessages(c.id); loadTemplateSuggestions(c.id); loadTimeline(c.id); loadCustomerMatches(c.id); }} className={`w-full text-left border rounded-md p-2 hover:bg-muted/50 ${selected?.id === c.id ? "border-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.customerName || c.customerPhone}</p>
                  <div className="flex gap-1"><Badge>{c.status}</Badge><Badge variant={c.windowOpen ? "secondary" : "destructive"}>{c.windowOpen ? "Ventana abierta" : "Ventana cerrada"}</Badge></div>
                </div>
                <p className="text-xs text-muted-foreground">{c.customerPhone}</p>
                <p className="text-xs text-muted-foreground">No leídos: {c.unreadCount} · Asignado: {c.assignedUserId || "-"}</p>
                <p className="text-xs text-muted-foreground">Cliente: {c.customerId ? `#${c.customerId}` : "sin vincular"} · owner: {c.ownerMode || "human"}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><h2 className="font-semibold">Conversación activa {selected ? `#${selected.id}` : ""}</h2></CardHeader>
          <CardContent className="space-y-3">
            {!selected ? <p className="text-sm text-muted-foreground">Seleccioná una conversación para operar.</p> : null}
            {selected ? (
              <>
                <div className="grid md:grid-cols-2 gap-2 border rounded-md p-2">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Teléfono: <strong>{selected.customerPhone}</strong></p>
                    <p>Cliente vinculado: <strong>{selected.customerId ? `#${selected.customerId}` : "No"}</strong></p>
                    <p>Match: {selected.customerMatchConfidence ?? "-"}</p>
                    <p>Última actividad: {selected.lastMessageAt ? new Date(selected.lastMessageAt).toLocaleString() : "-"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => changeStatus("PENDING_CUSTOMER")}>Pendiente</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus("RESOLVED")}>Resuelta</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus("CLOSED")}>Cerrar</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus("OPEN")}>Reabrir</Button>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-2 border rounded-md p-2">
                  <div><Label>Estado</Label><Select value={selected.status} onValueChange={changeStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Asignación</Label><Select value={selected.assignedUserId ? String(selected.assignedUserId) : "none"} onValueChange={assignConversation}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin asignar</SelectItem>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}</SelectContent></Select></div>
                  <div className="flex items-end"><Button variant="secondary" onClick={markRead} disabled={busyAction === "mark-read"}>Marcar leído</Button></div>
                </div>

                <div className="grid md:grid-cols-4 gap-2 border rounded-md p-2">
                  <div><Label>Owner mode</Label><Select value={ownerMode} onValueChange={(v) => { setOwnerMode(v); void updateOperationalState({ ownerMode: v }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="human">human</SelectItem><SelectItem value="assisted">assisted</SelectItem><SelectItem value="auto">auto</SelectItem></SelectContent></Select></div>
                  <div><Label>Handoff</Label><Select value={handoffStatus} onValueChange={(v) => { setHandoffStatus(v); void updateOperationalState({ handoffStatus: v }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">none</SelectItem><SelectItem value="requested">requested</SelectItem><SelectItem value="active">active</SelectItem><SelectItem value="completed">completed</SelectItem></SelectContent></Select></div>
                  <div className="flex items-end"><Button size="sm" variant={automationEnabled ? "secondary" : "outline"} onClick={() => { const next = !automationEnabled; setAutomationEnabled(next); void updateOperationalState({ automationEnabled: next, automationPausedReason: next ? null : (automationPausedReason || "manual") }); }}>{automationEnabled ? "Automation ON" : "Automation OFF"}</Button></div>
                  <div><Label>Pausa</Label><Input value={automationPausedReason} onChange={(e) => setAutomationPausedReason(e.target.value)} onBlur={() => void updateOperationalState({ automationPausedReason })} /></div>
                </div>

                <div className="border rounded-md p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={customerCreateName} onChange={(e) => setCustomerCreateName(e.target.value)} placeholder="Nombre para crear cliente" />
                    <Button size="sm" variant="outline" onClick={createCustomerFromConversation} disabled={busyAction === "create-customer"}>Crear cliente</Button>
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(selected.customerPhone || "")}>Copiar teléfono</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customerMatches.map((c) => <Button key={c.id} size="sm" variant="secondary" onClick={() => linkCustomer(c.id)}>Vincular #{c.id} {c.name}</Button>)}
                    {!customerMatches.length ? <span className="text-xs text-muted-foreground">Sin coincidencias por teléfono</span> : null}
                  </div>
                </div>
              </>
            ) : null}

            {selected && !selected.windowOpen ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium">Ventana de 24h cerrada</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <Select value={templateUsageFilter} onValueChange={setTemplateUsageFilter}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent>{USAGE_FILTER_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select>
                  <Select value={selectedTemplateCode} onValueChange={setSelectedTemplateCode}><SelectTrigger className="w-[260px]"><SelectValue placeholder="Template" /></SelectTrigger><SelectContent><SelectItem value="hello_world">hello_world</SelectItem>{templateSuggestions.map((t) => <SelectItem key={t.id} value={String(t.key || `template_${t.id}`)}>{t.name} · {t.usageType || "custom"}</SelectItem>)}</SelectContent></Select>
                  <Button variant="secondary" onClick={sendTemplateReply} disabled={busyAction === "send-template"}>Enviar plantilla</Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2 max-h-[45vh] overflow-auto">
              {messages.map((m) => (
                <div key={m.id} className="border rounded-md p-2">
                  <div className="flex gap-2 items-center">
                    <Badge variant={m.direction === "INBOUND" ? "secondary" : "outline"}>{m.direction}</Badge>
                    <Badge variant="outline">{m.status}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{m.contentText || "(sin texto)"}</p>
                </div>
              ))}
            </div>

            {selected ? (
              <div className="border rounded-md p-2">
                <p className="text-sm font-medium mb-2">Timeline</p>
                <div className="space-y-1 max-h-[120px] overflow-auto text-xs text-muted-foreground">
                  {timeline.map((ev) => <p key={ev.id}>{new Date(ev.createdAt).toLocaleString()} · {ev.eventType}</p>)}
                  {!timeline.length ? <p>Sin eventos aún</p> : null}
                </div>
              </div>
            ) : null}

            {selected ? <div className="flex gap-2 pt-2 border-t"><Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder manualmente..." /><Button onClick={sendReply} disabled={busyAction === "send" || !reply.trim()}>Enviar</Button></div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
