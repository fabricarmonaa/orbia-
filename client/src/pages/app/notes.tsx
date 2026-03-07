import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Note = { id: number; title: string; content?: string | null; remindAt?: string | null; status: string; showInAgenda: boolean };

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [form, setForm] = useState({ title: "", content: "", date: "", time: "09:00", allDay: false, showInAgenda: true });

  async function load() {
    const res = await apiRequest("GET", "/api/notes?status=TODAS");
    const json = await res.json();
    setNotes(json.data || []);
  }
  useEffect(() => { load(); }, []);

  async function createNote() {
    const remindAt = form.date ? `${form.date}T${form.time || "09:00"}:00.000Z` : null;
    await apiRequest("POST", "/api/notes", { title: form.title, content: form.content || null, remindAt, allDay: form.allDay, showInAgenda: form.showInAgenda, status: "ACTIVA" });
    setForm({ title: "", content: "", date: "", time: "09:00", allDay: false, showInAgenda: true });
    await load();
  }

  async function setStatus(id: number, status: string) {
    await apiRequest("PATCH", `/api/notes/${id}`, { status });
    await load();
  }

  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">Notas</h1>
    <Card>
      <CardHeader><CardTitle>Nueva nota</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><Label>Contenido</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Fecha opcional</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><Label>Hora</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
        </div>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.showInAgenda} onChange={(e) => setForm({ ...form, showInAgenda: e.target.checked })} /> Mostrar también en Agenda</label>
        <Button onClick={createNote} disabled={!form.title.trim()}>Crear nota</Button>
      </CardContent>
    </Card>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {notes.map((n) => (
        <Card key={n.id}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{n.title}</p>
              <span className="text-xs text-muted-foreground">{n.status}</span>
            </div>
            {n.content ? <p className="text-sm">{n.content}</p> : null}
            {n.remindAt ? <p className="text-xs text-muted-foreground">{new Date(n.remindAt).toLocaleString("es-AR")}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStatus(n.id, "HECHA")}>Hecha</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(n.id, "ARCHIVADA")}>Archivar</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>;
}
