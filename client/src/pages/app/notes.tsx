import { useEffect, useState, useMemo } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { NotebookPen, Plus, Calendar as CalendarIcon, Clock, CheckCircle2, Archive, Trash2, Tag, AlignLeft, CalendarDays } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Note = { id: number; title: string; content?: string | null; remindAt?: string | null; status: string; showInAgenda: boolean };

function toIsoDay(d: Date) { return d.toISOString().slice(0, 10); }

export default function NotesPage() {
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("ACTIVA");
  const [form, setForm] = useState({
    title: "",
    content: "",
    date: "",
    time: "09:00",
    allDay: false,
    showInAgenda: true
  });

  async function load() {
    try {
      // Load all notes, we will filter them in the client for better UX during tab switching
      const res = await apiRequest("GET", "/api/notes?status=TODAS");
      const json = await res.json();
      setNotes(json.data || []);
    } catch (err) {
      toast({ title: "Error", description: "No se pudieron cargar las notas", variant: "destructive" });
    }
  }

  useEffect(() => { load(); }, []);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => n.status === filter).sort((a, b) => {
      if (a.remindAt && !b.remindAt) return -1;
      if (!a.remindAt && b.remindAt) return 1;
      if (a.remindAt && b.remindAt) return new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime();
      return b.id - a.id;
    });
  }, [notes, filter]);

  async function createNote() {
    if (!form.title.trim()) return;
    const remindAt = form.date ? `${form.date}T${form.time || "09:00"}:00.000Z` : null;
    try {
      await apiRequest("POST", "/api/notes", {
        title: form.title,
        content: form.content || null,
        remindAt,
        allDay: form.allDay,
        showInAgenda: form.showInAgenda,
        status: "ACTIVA"
      });
      setOpen(false);
      setForm({ title: "", content: "", date: "", time: "09:00", allDay: false, showInAgenda: true });
      await load();
      toast({ title: "Nota creada exitosamente" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo crear la nota", variant: "destructive" });
    }
  }

  async function setStatus(id: number, status: string) {
    try {
      await apiRequest("PATCH", `/api/notes/${id}`, { status });
      await load();
      toast({ title: `Nota marcada como ${status.toLowerCase()}` });
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo actualizar la nota", variant: "destructive" });
    }
  }

  async function deleteNote(id: number) {
    if (!confirm("¿Eliminar esta nota de forma permanente?")) return;
    try {
      await apiRequest("DELETE", `/api/notes/${id}`);
      await load();
      toast({ title: "Nota eliminada" });
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    }
  }

  const isOverdue = (dateStr?: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <NotebookPen className="w-8 h-8 text-primary" />
            Notas
          </h1>
          <p className="text-muted-foreground mt-1">Tus ideas, tareas y recordatorios organizados.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Nueva nota
        </Button>
      </div>

      <div className="flex items-center justify-between border-b pb-4">
        <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="ACTIVA">Activas</TabsTrigger>
            <TabsTrigger value="HECHA">Completadas</TabsTrigger>
            <TabsTrigger value="ARCHIVADA">Archivadas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-card rounded-lg border border-dashed mt-8">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <NotebookPen className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-medium text-foreground">No hay notas {filter.toLowerCase()}s</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Crea una nueva nota para mantener organizados tus apuntes y recordatorios.</p>
          {filter === "ACTIVA" && (
            <Button variant="outline" className="mt-6" onClick={() => setOpen(true)}>
              Agregar nota
            </Button>
          )}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6 pt-2">
          {filteredNotes.map((n) => (
            <Card key={n.id} className="break-inside-avoid shadow-sm hover:shadow-md transition-shadow border-border/60 group flex flex-col h-fit">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg font-semibold leading-tight break-words">{n.title}</CardTitle>
                  <div className="flex items-center gap-1">
                    {n.showInAgenda && <div title="Visible en Agenda" className="shrink-0"><CalendarDays className="w-4 h-4 text-primary" /></div>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 flex-grow space-y-4">
                {n.content && (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{n.content}</p>
                )}

                {n.remindAt && (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${isOverdue(n.remindAt) && n.status === 'ACTIVA' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(n.remindAt).toLocaleString("es-AR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {isOverdue(n.remindAt) && n.status === 'ACTIVA' && " (Vencido)"}
                  </div>
                )}
              </CardContent>
              <CardFooter className="p-4 pt-0 border-t mt-auto flex justify-end gap-2 bg-muted/20 opacity-0 group-hover:opacity-100 transition-opacity">
                {n.status !== 'HECHA' && (
                  <Button size="sm" variant="ghost" className="h-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => setStatus(n.id, "HECHA")}>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Completar
                  </Button>
                )}
                {n.status !== 'ARCHIVADA' && (
                  <Button size="sm" variant="ghost" className="h-8 text-slate-600 hover:bg-slate-100" onClick={() => setStatus(n.id, "ARCHIVADA")}>
                    <Archive className="w-4 h-4 mr-1.5" /> Archivar
                  </Button>
                )}
                {n.status !== 'ACTIVA' && (
                  <Button size="sm" variant="ghost" className="h-8 text-blue-600 hover:bg-blue-50" onClick={() => setStatus(n.id, "ACTIVA")}>
                    Restaurar
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 shrink-0 ml-auto" onClick={() => deleteNote(n.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Nueva nota</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5 flex flex-col">
              <Label htmlFor="title" className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" /> Título
              </Label>
              <Input
                id="title"
                placeholder="Ej. Recordar llamar a proveedor"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="space-y-1.5 flex flex-col">
              <Label htmlFor="content" className="flex items-center gap-2">
                <AlignLeft className="w-3.5 h-3.5" /> Contenido (opcional)
              </Label>
              <Textarea
                id="content"
                placeholder="Escribe los detalles de la nota aquí..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="resize-none min-h-[120px]"
              />
            </div>

            <div className="bg-muted/40 p-4 rounded-lg border space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 flex flex-col">
                  <Label htmlFor="date" className="flex items-center gap-2">
                    <CalendarIcon className="w-3.5 h-3.5" /> Fecha (opcional)
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                {form.date && !form.allDay && (
                  <div className="space-y-1.5 flex flex-col animate-in fade-in">
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

              {form.date && (
                <div className="pt-2 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="all-day" className="font-normal cursor-pointer">Es de todo el día</Label>
                    <Switch id="all-day" checked={form.allDay} onCheckedChange={(checked) => setForm({ ...form, allDay: checked, time: checked ? "09:00" : form.time })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="agenda" className="font-medium cursor-pointer text-primary">Mostrar automáticante en la Agenda</Label>
                    <Switch id="agenda" checked={form.showInAgenda} onCheckedChange={(checked) => setForm({ ...form, showInAgenda: checked })} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="sm:justify-between w-full">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createNote} disabled={!form.title.trim()}>Crear nota</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
