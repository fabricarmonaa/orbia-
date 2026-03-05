import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Download, FileText, Minus, Plus, X, Search, UserPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/auth";
import { downloadQuotePdf } from "@/lib/pdfs";

// ── Types ──────────────────────────────────────────────────────────
interface Customer {
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
}

interface QuoteItem {
    id: number;
    name: string;
    description: string | null;
    price: number;
    sku: string | null;
    quantity: number;
}

interface QuoteModalProps {
    open: boolean;
    onClose: () => void;
    initialItems: Array<{
        id: number;
        name: string;
        description: string | null;
        price: number;
        sku: string | null;
    }>;
}

// ── Customer Autocomplete component ───────────────────────────────
function CustomerAutocompleteField({
    value,
    onChange,
    onCreateNew,
}: {
    value: { name: string; company: string; phone: string; email: string };
    onChange: (v: typeof value) => void;
    onCreateNew: () => void;
}) {
    const [query, setQuery] = useState(value.name);
    const [results, setResults] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!query || query.length < 2) { setResults([]); setOpen(false); return; }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await apiRequest("GET", `/api/customers?q=${encodeURIComponent(query)}&pageSize=8`);
                const json = await res.json();
                setResults(json.data || []);
                setOpen(true);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query]);

    // Close dropdown on outside click
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    function selectCustomer(c: Customer) {
        onChange({
            name: c.name,
            company: c.company || "",
            phone: c.phone || "",
            email: c.email || "",
        });
        setQuery(c.name);
        setOpen(false);
    }

    return (
        <div ref={containerRef} className="relative">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            onChange({ ...value, name: e.target.value });
                        }}
                        placeholder="Buscá por nombre o empresa..."
                        className="pl-8"
                    />
                    {loading && <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                <Button type="button" variant="outline" size="icon" title="Nuevo cliente" onClick={onCreateNew}>
                    <UserPlus className="w-4 h-4" />
                </Button>
            </div>

            {/* Dropdown */}
            {open && results.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                    {results.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors text-sm"
                            onMouseDown={() => selectCustomer(c)}
                        >
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {[c.company, c.phone, c.email].filter(Boolean).join("  ·  ")}
                            </p>
                        </button>
                    ))}
                </div>
            )}
            {open && results.length === 0 && !loading && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg px-3 py-3 text-sm text-muted-foreground">
                    Sin resultados. Usá el botón <strong>+</strong> para crear.
                </div>
            )}
        </div>
    );
}

// ── New customer mini-form ─────────────────────────────────────────
function NewCustomerInline({
    onSaved,
    onCancel,
}: {
    onSaved: (c: { name: string; company: string; phone: string; email: string }) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState({ name: "", company: "", phone: "", email: "" });
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            await apiRequest("POST", "/api/customers", {
                name: form.name,
                phone: form.phone || null,
                email: form.email || null,
            });
            toast({ title: "Cliente creado" });
            onSaved(form);
        } catch (err: any) {
            toast({ title: "Error al crear cliente", description: err.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={save} className="border rounded-lg p-3 bg-muted/30 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nuevo cliente</p>
            <div className="grid grid-cols-2 gap-2">
                <Input required placeholder="Nombre *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                <Input placeholder="Teléfono" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? "Guardando..." : "Guardar cliente"}</Button>
            </div>
        </form>
    );
}

// ══════════════════════════════════════════════════════════════════
// MAIN MODAL
// ══════════════════════════════════════════════════════════════════
export function QuoteModal({ open, onClose, initialItems }: QuoteModalProps) {
    const { toast } = useToast();
    const [items, setItems] = useState<QuoteItem[]>(
        initialItems.map((it) => ({ ...it, quantity: 1 })),
    );
    const [customer, setCustomer] = useState({ name: "", company: "", phone: "", email: "" });
    const [discount, setDiscount] = useState("0");
    const [notes, setNotes] = useState("");
    const [validity, setValidity] = useState("7");
    const [loading, setLoading] = useState(false);
    const [showNewCustomer, setShowNewCustomer] = useState(false);

    // Reset when reopened with new items
    useEffect(() => {
        if (open) {
            setItems(initialItems.map((it) => ({ ...it, quantity: 1 })));
            setCustomer({ name: "", company: "", phone: "", email: "" });
            setDiscount("0");
            setNotes("");
            setValidity("7");
            setShowNewCustomer(false);
        }
    }, [open]);

    const subtotal = items.reduce((acc, it) => acc + it.price * it.quantity, 0);
    const discountAmt = subtotal * (parseFloat(discount) || 0) / 100;
    const total = subtotal - discountAmt;

    const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function updateQty(id: number, delta: number) {
        setItems((prev) => prev.map((it) => it.id === id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it));
    }

    function removeItem(id: number) {
        setItems((prev) => prev.filter((it) => it.id !== id));
    }

    async function handleDownload() {
        if (items.length === 0) {
            toast({ title: "Agregá al menos un producto", variant: "destructive" });
            return;
        }
        setLoading(true);
        try {
            await downloadQuotePdf({
                customer: {
                    name: customer.name || undefined,
                    company: customer.company || undefined,
                    phone: customer.phone || undefined,
                    email: customer.email || undefined,
                },
                items: items.map((it) => ({
                    id: it.id,
                    name: it.name,
                    description: it.description,
                    price: it.price,
                    quantity: it.quantity,
                    sku: it.sku,
                })),
                discount: parseFloat(discount) || 0,
                notes: notes || undefined,
                validity: parseInt(validity) || 7,
            });
            toast({ title: "¡Presupuesto descargado!" });
        } catch (err: any) {
            toast({ title: "Error al generar PDF", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Generar presupuesto
                    </DialogTitle>
                    <DialogDescription>
                        Completá los datos del cliente, ajustá cantidades y descargá el PDF.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">

                    {/* ── Cliente ── */}
                    <div className="space-y-2.5">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Datos del cliente</p>

                        {showNewCustomer ? (
                            <NewCustomerInline
                                onSaved={(c) => { setCustomer(c); setShowNewCustomer(false); }}
                                onCancel={() => setShowNewCustomer(false)}
                            />
                        ) : (
                            <CustomerAutocompleteField
                                value={customer}
                                onChange={setCustomer}
                                onCreateNew={() => setShowNewCustomer(true)}
                            />
                        )}

                        {/* Populated fields preview */}
                        {(customer.company || customer.phone || customer.email) && !showNewCustomer && (
                            <div className="grid grid-cols-3 gap-2">
                                {customer.company && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Empresa</Label>
                                        <Input value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} className="h-8 text-sm" />
                                    </div>
                                )}
                                {customer.phone && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Teléfono</Label>
                                        <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="h-8 text-sm" />
                                    </div>
                                )}
                                {customer.email && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Email</Label>
                                        <Input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className="h-8 text-sm" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Ítems ── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                                Productos ({items.length})
                            </p>
                            {items.length === 0 && (
                                <Badge variant="destructive" className="text-xs">Sin productos</Badge>
                            )}
                        </div>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {items.map((it) => (
                                <div key={it.id} className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-card">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{it.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            $ {fmt(it.price)} c/u · <span className="font-semibold">Subtotal: $ {fmt(it.price * it.quantity)}</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(it.id, -1)}>
                                            <Minus className="w-3 h-3" />
                                        </Button>
                                        <span className="text-sm font-semibold w-7 text-center">{it.quantity}</span>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(it.id, 1)}>
                                            <Plus className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeItem(it.id)}>
                                        <X className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Ajustes ── */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Descuento global (%)</Label>
                            <Input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Validez (días)</Label>
                            <Input type="number" min="1" max="365" value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="7" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Observaciones / condiciones</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Precios sujetos a disponibilidad de stock. Válido por los días indicados."
                            rows={2}
                        />
                    </div>

                    {/* ── Totales ── */}
                    <div className="border rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/30 flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium">$ {fmt(subtotal)}</span>
                        </div>
                        {(parseFloat(discount) || 0) > 0 && (
                            <div className="px-4 py-2.5 border-t flex justify-between text-sm text-red-600">
                                <span>Descuento ({discount}%)</span>
                                <span>- $ {fmt(discountAmt)}</span>
                            </div>
                        )}
                        <div className="px-4 py-3 border-t bg-foreground flex justify-between">
                            <span className="font-bold text-background">TOTAL</span>
                            <span className="font-bold text-background text-base">$ {fmt(total)}</span>
                        </div>
                    </div>

                    {/* ── Acciones ── */}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleDownload} disabled={loading || items.length === 0}>
                            <Download className="w-4 h-4 mr-2" />
                            {loading ? "Generando..." : "Descargar PDF"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
