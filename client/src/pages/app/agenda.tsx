import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type AgendaEvent = { id: number; title: string; description?: string | null; startsAt: string; allDay: boolean; eventType: string; sourceEntityType?: string | null; sourceEntityId?: number | null };

function toIsoDay(d: Date) { return d.toISOString().slice(0,10); }

export default function AgendaPage() {
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", date: toIsoDay(new Date()), time: "09:00", allDay: false });

  const monthStart = useMemo(() => new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1), [selectedDay]);
  const monthEnd = useMemo(() => new Date(selectedDay.getFullYear(), selectedDay.getMonth()+1, 1), [selectedDay]);

  async function load() {
    const res = await apiRequest("GET", `/api/agenda/events?from=${encodeURIComponent(monthStart.toISOString())}&to=${encodeURIComponent(monthEnd.toISOString())}`);
    const json = await res.json();
    setEvents(json.data || []);
  }
  useEffect(() => { load(); }, [monthStart.toISOString()]);

  const byDay = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    for (const e of events) {
      const key = toIsoDay(new Date(e.startsAt));
      map[key] = map[key] || [];
      map[key].push(e);
    }
    return map;
  }, [events]);

  const dayEvents = byDay[toIsoDay(selectedDay)] || [];

  async function createEvent() {
    const startsAt = form.allDay ? `${form.date}T09:00:00.000Z` : `${form.date}T${form.time}:00.000Z`;
    await apiRequest("POST", "/api/agenda/events", { title: form.title, description: form.description || null, startsAt, allDay: form.allDay, eventType: "MANUAL" });
    setOpen(false);
    setForm({ title: "", description: "", date: toIsoDay(selectedDay), time: "09:00", allDay: false });
    await load();
  }

  return <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Agenda</h1>
      <Button onClick={() => { setForm((f) => ({ ...f, date: toIsoDay(selectedDay) })); setOpen(true); }}>Nuevo evento</Button>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
      <Card>
        <CardContent className="pt-4">
          <DayPicker mode="single" selected={selectedDay} onSelect={(d) => d && setSelectedDay(d)} modifiers={{ hasEvents: Object.keys(byDay).map((x) => new Date(`${x}T00:00:00`)) }} modifiersClassNames={{ hasEvents: "bg-primary/10 rounded-md" }} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Eventos del día</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {dayEvents.length === 0 ? <p className="text-sm text-muted-foreground">Sin eventos para este día.</p> : dayEvents.map((e) => (
            <div key={e.id} className="border rounded-md p-3">
              <p className="font-medium">{e.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(e.startsAt).toLocaleString("es-AR")} · {e.eventType}</p>
              {e.description ? <p className="text-sm mt-1">{e.description}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo evento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Fecha</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            {!form.allDay && <div><Label>Hora</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>}
          </div>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> Todo el día</label>
          <Button className="w-full" onClick={createEvent} disabled={!form.title.trim()}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
