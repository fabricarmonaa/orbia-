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
import { CalendarDays, Clock, ExternalLink, Plus, Tag, Calendar as CalendarIcon, AlignLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

type AgendaEvent = {
  id: number;
  title: string;
  description?: string | null;
  startsAt: string;
  allDay: boolean;
  eventType: string;
  sourceEntityType?: string | null;
  sourceEntityId?: number | null;
};

function toIsoDay(d: Date) { return d.toISOString().slice(0, 10); }

export default function AgendaPage() {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: toIsoDay(new Date()),
    time: "09:00",
    allDay: false,
    eventType: "MANUAL"
  });

  const monthStart = useMemo(() => new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1), [selectedDay]);
  const monthEnd = useMemo(() => new Date(selectedDay.getFullYear(), selectedDay.getMonth() + 1, 1), [selectedDay]);

  async function load() {
    try {
      const res = await apiRequest("GET", `/api/agenda/events?from=${encodeURIComponent(monthStart.toISOString())}&to=${encodeURIComponent(monthEnd.toISOString())}`);
      const json = await res.json();
      setEvents(json.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudieron cargar los eventos", variant: "destructive" });
    }
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

  // Sort events so all-day events are grouped at the top, then by time
  const sortedDayEvents = useMemo(() => {
    return [...dayEvents].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [dayEvents]);

  const upcomingEvents = useMemo(() => {
    const todayStr = toIsoDay(new Date());
    return events
      .filter((e) => toIsoDay(new Date(e.startsAt)) >= todayStr)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 5);
  }, [events]);

  async function createEvent() {
    if (!form.title.trim()) return;
    const startsAt = form.allDay ? `${form.date}T09:00:00.000Z` : `${form.date}T${form.time}:00.000Z`;
    try {
      await apiRequest("POST", "/api/agenda/events", {
        title: form.title,
        description: form.description || null,
        startsAt,
        allDay: form.allDay,
        eventType: form.eventType
      });
      setOpen(false);
      setForm({ title: "", description: "", date: toIsoDay(selectedDay), time: "09:00", allDay: false, eventType: "MANUAL" });
      await load();
      toast({ title: "Evento creado exitosamente" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo crear el evento", variant: "destructive" });
    }
  }

  const getEventBadge = (type: string) => {
    switch (type) {
      case "ORDER": return <Badge variant="default" className="bg-blue-600">Pedido</Badge>;
      case "NOTE": return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Nota</Badge>;
      case "REMINDER": return <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">Recordatorio</Badge>;
      case "TASK": return <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">Tarea</Badge>;
      case "MANUAL": default: return <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50">Manual</Badge>;
    }
  };

  const hasEventsModifiers = { hasEvents: Object.keys(byDay).map((x) => new Date(`${x}T00:00:00`)) };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarDays className="w-8 h-8 text-primary" />
            Agenda
          </h1>
          <p className="text-muted-foreground mt-1">Organizá tus eventos, pedidos y recordatorios.</p>
        </div>
        <Button onClick={() => { setForm((f) => ({ ...f, date: toIsoDay(selectedDay) })); setOpen(true); }} className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Nuevo evento
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[400px_1fr] gap-6 items-start">
        {/* Left Column: Calendar & Upcoming */}
        <div className="space-y-6">
          <Card className="shadow-sm border-border/60 overflow-hidden">
            <CardContent className="p-0">
              <div className="p-3 bg-card border-b flex justify-center daypicker-wrapper">
                <style dangerouslySetInnerHTML={{
                  __html: `
                  .rdp { --rdp-accent-color: hsl(var(--primary)); --rdp-background-color: hsl(var(--primary)/0.1); margin: 0; }
                  .rdp-day_selected { font-weight: bold; }
                  .rdp-day:hover:not(.rdp-day_selected) { background-color: hsl(var(--muted)); }
                  .has-events-dot::after {
                    content: ''; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
                    width: 4px; height: 4px; border-radius: 50%; background-color: hsl(var(--primary));
                  }
                  .rdp-day_selected.has-events-dot::after { background-color: white; }
                `}} />
                <DayPicker
                  mode="single"
                  locale={es}
                  selected={selectedDay}
                  onSelect={(d) => d && setSelectedDay(d)}
                  modifiers={hasEventsModifiers}
                  modifiersClassNames={{ hasEvents: "has-events-dot" }}
                  modifiersStyles={{ hasEvents: { fontWeight: 'bold', position: 'relative' } } as any}
                  className="mx-auto"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-4 border-b bg-muted/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Próximos eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-4">No hay eventos próximos.</p>
              ) : (
                upcomingEvents.map((e) => (
                  <div key={e.id} className="flex gap-3 group cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors" onClick={() => setSelectedDay(new Date(e.startsAt))}>
                    <div className="flex flex-col items-center justify-center min-w-[50px] px-2 py-1 bg-muted/50 rounded-md text-center border">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">
                        {new Date(e.startsAt).toLocaleString("es-AR", { month: "short" })}
                      </span>
                      <span className="text-lg font-bold text-foreground leading-none mt-0.5">
                        {new Date(e.startsAt).getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{e.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {e.allDay ? "Todo el día" : new Date(e.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {getEventBadge(e.eventType)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Day Details */}
        <div className="space-y-6">
          <Card className="shadow-sm border-border/60 min-h-[500px]">
            <CardHeader className="py-5 border-b bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">
                    {selectedDay.toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {sortedDayEvents.length} evento{sortedDayEvents.length !== 1 ? 's' : ''} programado{sortedDayEvents.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setForm((f) => ({ ...f, date: toIsoDay(selectedDay) })); setOpen(true); }} className="hidden sm:flex">
                  <Plus className="w-4 h-4 mr-1" /> Evento
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sortedDayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <CalendarIcon className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">Día libre</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">No hay eventos programados para este día. Disfrutá tu tiempo o agregá una nueva tarea.</p>
                  <Button variant="outline" className="mt-6" onClick={() => { setForm((f) => ({ ...f, date: toIsoDay(selectedDay) })); setOpen(true); }}>
                    Agregar un evento
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {sortedDayEvents.map((e) => (
                    <div key={e.id} className="p-4 sm:p-6 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row gap-4 group">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-14 items-center flex flex-col pt-1 ${e.allDay ? 'text-primary font-semibold' : 'text-muted-foreground font-medium'}`}>
                          {e.allDay ? (
                            <span className="text-sm text-center">Todo<br />día</span>
                          ) : (
                            <span className="text-sm">{new Date(e.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                          )}
                        </div>
                        <div className="w-1 border-l-4 border-primary/20 h-auto self-stretch rounded-full mx-2 hidden sm:block"></div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-base font-semibold leading-tight text-foreground">{e.title}</h4>
                            <div className="shrink-0">{getEventBadge(e.eventType)}</div>
                          </div>

                          {e.description && (
                            <div className="text-sm text-muted-foreground bg-muted/40 p-3 rounded-md border border-border/50 flex items-start gap-2">
                              <AlignLeft className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/70" />
                              <p className="whitespace-pre-wrap">{e.description}</p>
                            </div>
                          )}

                          {e.sourceEntityType === "ORDER" && e.sourceEntityId && (
                            <div className="mt-3">
                              <Link href={`/app/orders?id=${e.sourceEntityId}`}>
                                <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-200">
                                  Ver pedido origen <ExternalLink className="w-3 h-3" />
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Nuevo evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5 flex flex-col">
              <Label>Afección a un tipo</Label>
              <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">General / Manual</SelectItem>
                  <SelectItem value="TASK">Tarea</SelectItem>
                  <SelectItem value="REMINDER">Recordatorio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex flex-col">
              <Label htmlFor="title" className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" /> Título
              </Label>
              <Input
                id="title"
                placeholder="Ej. Reunión de equipo"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="date" className="flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5" /> Fecha
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              {!form.allDay && (
                <div className="space-y-1.5 flex flex-col animate-in fade-in slide-in-from-top-1">
                  <Label htmlFor="time" className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Hora
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1 border-t border-b py-3 my-2">
              <Switch
                id="all-day"
                checked={form.allDay}
                onCheckedChange={(checked) => setForm({ ...form, allDay: checked, time: checked ? "09:00" : form.time })}
              />
              <Label htmlFor="all-day" className="font-normal cursor-pointer">Es un evento de todo el día</Label>
            </div>

            <div className="space-y-1.5 flex flex-col">
              <Label htmlFor="desc" className="flex items-center gap-2">
                <AlignLeft className="w-3.5 h-3.5" /> Descripción (opcional)
              </Label>
              <Textarea
                id="desc"
                placeholder="Detalles adicionales del evento..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="resize-none min-h-[90px]"
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between w-full">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createEvent} disabled={!form.title.trim()}>Guardar evento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
