import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CalendarDays, Clock, ExternalLink, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AgendaEvent = {
  id: string | number;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  eventType: string;
  sourceEntityType?: string | null;
  htmlLink?: string | null;
};

type CalendarStatus = {
  connected: boolean;
  googleEmail?: string;
  selectedCalendarId?: string | null;
  calendars?: Array<{ id: string; summary: string; primary: boolean }>;
};

function toIsoDay(d: Date) { return d.toISOString().slice(0, 10); }

export default function AgendaPage() {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({ connected: false });

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: toIsoDay(new Date()),
    time: "09:00",
    allDay: false,
    saveToGoogle: true,
  });

  const monthStart = useMemo(() => new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1), [selectedDay]);
  const monthEnd = useMemo(() => new Date(selectedDay.getFullYear(), selectedDay.getMonth() + 1, 1), [selectedDay]);

  async function loadStatus() {
    const res = await apiRequest("GET", "/api/google/calendar/status");
    const json = await res.json();
    setCalendarStatus(json);
    if (!json.connected) setForm((prev) => ({ ...prev, saveToGoogle: false }));
  }

  async function loadEvents() {
    try {
      const res = await apiRequest("GET", `/api/agenda/events?from=${encodeURIComponent(monthStart.toISOString())}&to=${encodeURIComponent(monthEnd.toISOString())}`);
      const json = await res.json();
      setEvents(json.data || []);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar los eventos", variant: "destructive" });
    }
  }

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { loadEvents(); }, [monthStart.toISOString()]);

  const byDay = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    for (const e of events) {
      const key = toIsoDay(new Date(e.startsAt));
      (map[key] ||= []).push(e);
    }
    return map;
  }, [events]);

  const dayEvents = (byDay[toIsoDay(selectedDay)] || []).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  async function connectGoogleCalendar() {
    try {
      const res = await apiRequest("GET", "/api/google/calendar/connect-url");
      const data = await res.json();
      if (!data?.url) throw new Error("No se pudo iniciar la conexión");
      const popup = window.open(data.url, "orbia-google-calendar", "width=520,height=720");
      if (!popup) throw new Error("Tu navegador bloqueó la ventana de Google.");
      const listener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "orbia-google-calendar") return;
        window.removeEventListener("message", listener);
        if (!event.data?.ok) {
          toast({ title: "No se pudo conectar Google Calendar", description: event.data?.message || "Intentá nuevamente.", variant: "destructive" });
          return;
        }
        toast({ title: "Google Calendar conectado", description: "Ya podés usar tu agenda de Google." });
        loadStatus();
        loadEvents();
      };
      window.addEventListener("message", listener);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo conectar Google Calendar", variant: "destructive" });
    }
  }

  async function saveCalendar(calendarId: string) {
    await apiRequest("POST", "/api/google/calendar/select", { calendarId });
    setCalendarStatus((prev) => ({ ...prev, selectedCalendarId: calendarId }));
    toast({ title: "Calendario principal actualizado" });
    await loadEvents();
  }

  async function saveEvent() {
    if (!form.title.trim()) return;
    const startsAt = form.allDay ? `${form.date}T09:00:00.000Z` : `${form.date}T${form.time}:00.000Z`;
    const body = {
      title: form.title,
      description: form.description || null,
      startsAt,
      endsAt: null,
      allDay: form.allDay,
      saveToGoogle: form.saveToGoogle,
    };
    if (editing) {
      await apiRequest("PATCH", `/api/agenda/events/${encodeURIComponent(String(editing.id))}`, body);
      toast({ title: "Evento actualizado" });
    } else {
      await apiRequest("POST", "/api/agenda/events", body);
      toast({ title: "Evento creado" });
    }
    setOpen(false);
    setEditing(null);
    setForm({ title: "", description: "", date: toIsoDay(selectedDay), time: "09:00", allDay: false, saveToGoogle: Boolean(calendarStatus.connected && calendarStatus.selectedCalendarId) });
    await loadEvents();
  }

  async function removeEvent(id: string | number) {
    await apiRequest("DELETE", `/api/agenda/events/${encodeURIComponent(String(id))}`);
    toast({ title: "Evento eliminado" });
    await loadEvents();
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><CalendarDays className="w-8 h-8 text-primary" />Agenda</h1>
          <p className="text-muted-foreground mt-1">Google Calendar es la agenda principal cuando está conectado.</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm((f) => ({ ...f, date: toIsoDay(selectedDay) })); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />Nuevo evento</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integración Google Calendar</CardTitle>
          {!calendarStatus.connected ? (
            <CardDescription>Conectá tu cuenta para sincronizar, crear y editar eventos directamente en Google Calendar.</CardDescription>
          ) : (
            <CardDescription>Cuenta conectada: {calendarStatus.googleEmail}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!calendarStatus.connected ? (
            <Button onClick={connectGoogleCalendar}>Conectar Google Calendar</Button>
          ) : (
            <div className="max-w-md space-y-2">
              <Label>Calendario principal</Label>
              <Select value={calendarStatus.selectedCalendarId || undefined} onValueChange={saveCalendar}>
                <SelectTrigger><SelectValue placeholder="Seleccionar calendario" /></SelectTrigger>
                <SelectContent>
                  {(calendarStatus.calendars || []).map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>{cal.summary}{cal.primary ? " (principal)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <Card><CardContent className="p-4"><DayPicker mode="single" locale={es} selected={selectedDay} onSelect={(d) => d && setSelectedDay(d)} /></CardContent></Card>
        <Card>
          <CardHeader>
            <CardTitle>{selectedDay.toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</CardTitle>
            <CardDescription>{dayEvents.length} evento(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayEvents.map((e) => (
              <div key={String(e.id)} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.allDay ? "Todo el día" : new Date(e.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <Badge variant={e.sourceEntityType === "GOOGLE_CALENDAR" ? "default" : "outline"}>{e.sourceEntityType === "GOOGLE_CALENDAR" ? "Google" : "Local"}</Badge>
                </div>
                {e.description ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{e.description}</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditing(e);
                    const dt = new Date(e.startsAt);
                    setForm({
                      title: e.title,
                      description: e.description || "",
                      date: toIsoDay(dt),
                      time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
                      allDay: e.allDay,
                      saveToGoogle: e.sourceEntityType === "GOOGLE_CALENDAR" || Boolean(calendarStatus.connected && calendarStatus.selectedCalendarId),
                    });
                    setOpen(true);
                  }}><Pencil className="w-4 h-4 mr-1" />Editar</Button>
                  <Button size="sm" variant="destructive" onClick={() => removeEvent(e.id)}><Trash2 className="w-4 h-4 mr-1" />Eliminar</Button>
                  {e.htmlLink ? <Button size="sm" variant="secondary" asChild><a href={e.htmlLink} target="_blank" rel="noreferrer">Abrir en Google <ExternalLink className="w-4 h-4 ml-1" /></a></Button> : null}
                </div>
              </div>
            ))}
            {!dayEvents.length ? <p className="text-sm text-muted-foreground">No hay eventos para este día.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar evento" : "Nuevo evento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fecha</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              {!form.allDay ? <div><Label>Hora</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div> : null}
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.allDay} onCheckedChange={(v) => setForm({ ...form, allDay: v })} /><Label>Evento de todo el día</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.saveToGoogle} disabled={!calendarStatus.connected || !calendarStatus.selectedCalendarId} onCheckedChange={(v) => setForm({ ...form, saveToGoogle: v })} /><Label>Guardar también en Google Calendar</Label></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={saveEvent}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
