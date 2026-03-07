import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function WhatsappConversationsPage() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");

  async function loadConversations() {
    try {
      const res = await apiRequest("GET", "/api/whatsapp/conversations");
      const data = await res.json();
      setConversations(data.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function loadMessages(conversationId: number) {
    try {
      const res = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/messages`);
      const data = await res.json();
      setMessages(data.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    try {
      await apiRequest("POST", `/api/whatsapp/conversations/${selected.id}/messages/send`, { text: reply.trim() });
      toast({ title: "Mensaje enviado" });
      setReply("");
      await loadMessages(selected.id);
      await loadConversations();
    } catch (err: any) {
      toast({ title: "Error enviando", description: err.message, variant: "destructive" });
    }
  }

  useEffect(() => {
    loadConversations();
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <h2 className="font-semibold">Conversaciones WhatsApp</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {conversations.map((c) => (
            <button key={c.id} onClick={() => { setSelected(c); loadMessages(c.id); }} className="w-full text-left border rounded-md p-2 hover:bg-muted/50">
              <div className="flex items-center justify-between"><p className="font-medium">{c.customerPhone}</p><Badge>{c.status}</Badge></div>
              <p className="text-xs text-muted-foreground">Unread: {c.unreadCount} · Último: {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : "-"}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <h2 className="font-semibold">Mensajes {selected ? `#${selected.id}` : ""}</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {!selected ? <p className="text-sm text-muted-foreground">Seleccioná una conversación.</p> : null}
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
          {selected ? (
            <div className="flex gap-2 pt-2">
              <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder..." />
              <Button onClick={sendReply}>Enviar</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
