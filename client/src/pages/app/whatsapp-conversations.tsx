import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS = ["OPEN", "HUMAN", "BOT", "CLOSED"] as const;

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

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime()),
    [conversations],
  );

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
      const res = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/template-suggestions`);
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
    if (data.conversation) setSelected(data.conversation);
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
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/messages/send`, { text: reply.trim() });
      toast({ title: "Mensaje enviado" });
      setReply("");
      await loadMessages(selected.id);
      await loadConversations();
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
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/messages/send-template`, { templateCode: selectedTemplateCode });
      toast({ title: "Plantilla enviada" });
      await loadMessages(selected.id);
      await loadConversations();
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
      await loadConversations();
      const updated = { ...selected, unreadCount: 0 };
      setSelected(updated);
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
      const res = await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/status`, { status });
      const data = await res.json();
      setSelected(data.data || selected);
      await loadConversations();
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
      const res = await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/assign`, payload);
      const data = await res.json();
      setSelected(data.data || selected);
      await loadConversations();
      toast({ title: "Asignación actualizada" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando inbox...</p>;

  if (!addonEnabled) {
    return (
      <Card>
        <CardHeader>
          <h2 className="font-semibold">WhatsApp Inbox <Badge className="ml-2" variant="secondary">Addon</Badge></h2>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Este módulo requiere el addon <strong>WhatsApp Inbox</strong>.</p>
          <p className="text-sm text-muted-foreground">Contactá al administrador de la plataforma para habilitarlo en tu tenant y activar esta expansión premium.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp Inbox <Badge className="ml-2" variant="secondary">Addon</Badge></h1>
        <Button variant="outline" onClick={refreshAll}>Refrescar</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="font-semibold">Conversaciones ({sortedConversations.length})</h2>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-auto">
            {sortedConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c);
                  loadMessages(c.id);
                  loadTemplateSuggestions(c.id);
                }}
                className={`w-full text-left border rounded-md p-2 hover:bg-muted/50 ${selected?.id === c.id ? "border-primary" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.customerName || c.customerPhone}</p>
                  <div className="flex gap-1">
                    <Badge>{c.status}</Badge>
                    <Badge variant={c.windowOpen ? "secondary" : "destructive"}>{c.windowOpen ? "Ventana abierta" : "Ventana cerrada"}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{c.customerPhone}</p>
                <p className="text-xs text-muted-foreground">No leídos: {c.unreadCount} · {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : "-"}</p>
                <p className="text-xs text-muted-foreground">Asignado: {c.assignedUserId || "Sin asignar"}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-semibold">Conversación activa {selected ? `#${selected.id}` : ""} {selected ? <Badge className="ml-2" variant={selected.windowOpen ? "secondary" : "destructive"}>{selected.windowOpen ? "Ventana abierta" : "Ventana cerrada"}</Badge> : null}</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected ? <p className="text-sm text-muted-foreground">Seleccioná una conversación para operar el inbox.</p> : null}

            {selected ? (
              <div className="grid md:grid-cols-3 gap-2 border rounded-md p-2">
                <div>
                  <Label>Estado</Label>
                  <Select value={selected.status} onValueChange={changeStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Asignación</Label>
                  <Select value={selected.assignedUserId ? String(selected.assignedUserId) : "none"} onValueChange={assignConversation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="secondary" onClick={markRead} disabled={busyAction === "mark-read"}>Marcar leído</Button>
                </div>
              </div>
            ) : null}

            {selected && !selected.windowOpen ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium">Ventana de 24h cerrada</p>
                <p className="text-xs text-muted-foreground">Para responder, usá una plantilla de reenganche. Esto prepara el flujo de producción sin romper la operación.</p>
                <div className="flex gap-2 items-center">
                  <Select value={selectedTemplateCode} onValueChange={setSelectedTemplateCode}>
                    <SelectTrigger className="w-[260px]"><SelectValue placeholder="Template code" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hello_world">hello_world</SelectItem>
                      {templateSuggestions.map((t) => (
                        <SelectItem key={t.id} value={String(t.key || `template_${t.id}`)}>{t.name} · {t.usageType || "GENERAL"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <div className="flex gap-2 pt-2 border-t">
                <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder manualmente..." />
                <Button onClick={sendReply} disabled={busyAction === "send" || !reply.trim()}>Enviar</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
