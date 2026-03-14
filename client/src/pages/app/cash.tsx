import { useState, useEffect } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { usePlan } from "@/lib/plan";
import { getExpenseDefinitions } from "@/lib/expenses";
import { VoiceCommand } from "@/components/voice-command";
import { ExpenseDefinitionsDialog } from "@/components/expenses/ExpenseDefinitionsDialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportsDashboardPage from "./reports-dashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  DoorOpen,
  DoorClosed,
  Lock,
  Mic,
  Settings,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CashSession, CashMovement, ExpenseDefinition } from "@shared/schema";

export default function CashPage() {
  const { user } = useAuth();
  const { hasFeature, plan } = usePlan();
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSession, setOpenSession] = useState<CashSession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const [expenseDefinitions, setExpenseDefinitions] = useState<ExpenseDefinition[]>([]);
  const { toast } = useToast();

  const canUseSessions = hasFeature("cash_sessions");
  const canUseSTT = hasFeature("stt");
  const [showVoice, setShowVoice] = useState(false);
  const isTenantAdmin = user?.role === "admin";

  const [newMovement, setNewMovement] = useState({
    type: "ingreso",
    amount: "",
    method: "efectivo",
    category: "",
    description: "",
    associatedCost: "",
    associatedCostName: "",
    associatedCostType: "costo", // "costo" (resta) o "ingreso" (suma)
    impactNetProfit: true,
    expenseDefinitionId: "",
  });

  const [newAdditionalFees, setNewAdditionalFees] = useState<Array<{ name: string; amount: string; type: "costo" | "ingreso"; impactNetProfit: boolean }>>([]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CashMovement | null>(null);
  const [editAdditionalFees, setEditAdditionalFees] = useState<Array<{ name: string; amount: string; type: "costo" | "ingreso"; impactNetProfit: boolean }>>([]);

  const [editForm, setEditForm] = useState({
    amount: "",
    associatedCost: "",
    associatedCostName: "",
    associatedCostType: "costo",
    impactNetProfit: true,
    category: "",
    description: "",
    method: "efectivo",
  });

  const [openingAmount, setOpeningAmount] = useState("");
  const [closingAmount, setClosingAmount] = useState("");

  useEffect(() => {
    fetchData();
  }, [canUseSessions]);

  const refreshExpenseDefinitions = () => {
    getExpenseDefinitions()
      .then((data) => setExpenseDefinitions(data || []))
      .catch(() => { });
  };

  useEffect(() => {
    refreshExpenseDefinitions();
  }, []);

  async function fetchData() {
    try {
      const promises: Promise<Response>[] = [
        apiRequest("GET", "/api/cash/movements"),
      ];
      if (canUseSessions) {
        promises.push(apiRequest("GET", "/api/cash/sessions"));
      }
      const results = await Promise.all(promises);
      const movementsData = await results[0].json();
      setMovements(movementsData.data || []);

      if (canUseSessions && results[1]) {
        const sessionsData = await results[1].json();
        setSessions(sessionsData.data || []);
        const open = (sessionsData.data || []).find((s: CashSession) => s.status === "open");
        setOpenSession(open || null);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function openCashSession(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/cash/sessions", {
        openingAmount: parseFloat(openingAmount) || 0,
      });
      toast({ title: "Caja abierta" });
      setSessionDialogOpen(false);
      setOpeningAmount("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function closeCashSession(e: React.FormEvent) {
    e.preventDefault();
    if (!openSession) return;
    try {
      await apiRequest("PATCH", `/api/cash/sessions/${openSession.id}/close`, {
        closingAmount: parseFloat(closingAmount) || 0,
      });
      toast({ title: "Caja cerrada" });
      setCloseDialogOpen(false);
      setClosingAmount("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function addMovement(e: React.FormEvent) {
    e.preventDefault();
    try {
      let finalDescription = newMovement.description;
      let finalAssociatedCost = 0;
      let finalAmount = parseFloat(newMovement.amount) || 0;

      const fees = [
        { name: newMovement.associatedCostName, amount: newMovement.associatedCost, type: newMovement.associatedCostType as "costo" | "ingreso", impactNetProfit: newMovement.impactNetProfit },
        ...newAdditionalFees,
      ];

      for (const fee of fees) {
        const feeAmount = parseFloat(fee.amount || "0") || 0;
        if (feeAmount <= 0) continue;
        const feeName = fee.name || "Tarifa Extra";
        if (!fee.impactNetProfit) {
          finalDescription += `
[${feeName} de $${feeAmount} registrado como comentario - No modificó el total]`;
          continue;
        }
        if (fee.type === "ingreso") {
          finalAmount += feeAmount;
          finalDescription += `
[Se le sumó al cobro un ingreso extra de $${feeAmount} en concepto de ${feeName}]`;
        } else {
          finalAssociatedCost += feeAmount;
          finalDescription += `
[Se le descontó costo/tarifa en contra de $${feeAmount} por ${feeName}]`;
        }
      }

      await apiRequest("POST", "/api/cash/movements", {
        ...newMovement,
        amount: finalAmount,
        associatedCost: finalAssociatedCost || null,
        description: finalDescription,
        sessionId: openSession?.id || null,
        expenseDefinitionId:
          newMovement.expenseDefinitionId && newMovement.expenseDefinitionId !== "__empty__"
            ? parseInt(newMovement.expenseDefinitionId)
            : null,
      });
      toast({ title: "Movimiento registrado" });
      setDialogOpen(false);
      setNewMovement({
        type: "ingreso",
        amount: "",
        method: "efectivo",
        category: "",
        description: "",
        associatedCost: "",
        associatedCostName: "",
        associatedCostType: "costo",
        impactNetProfit: true,
        expenseDefinitionId: "",
      });
      setNewAdditionalFees([]);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }


  async function updateMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMovement) return;
    try {
      let finalDescription = editForm.description;
      let finalAssociatedCost = 0;
      let finalAmount = parseFloat(editForm.amount) || 0;

      const fees = [
        { name: editForm.associatedCostName, amount: editForm.associatedCost, type: editForm.associatedCostType as "costo" | "ingreso", impactNetProfit: editForm.impactNetProfit },
        ...editAdditionalFees,
      ];

      for (const fee of fees) {
        const feeAmount = parseFloat(fee.amount || "0") || 0;
        if (feeAmount <= 0) continue;
        const feeName = fee.name || "Tarifa Extra";
        if (!fee.impactNetProfit) {
          finalDescription += `
[${feeName} de $${feeAmount} registrado como comentario - No modificó el total]`;
          continue;
        }
        if (fee.type === "ingreso") {
          finalAmount += feeAmount;
          finalDescription += `
[Se le sumó al cobro un ingreso extra de $${feeAmount} en concepto de ${feeName}]`;
        } else {
          finalAssociatedCost += feeAmount;
          finalDescription += `
[Se le descontó costo/tarifa en contra de $${feeAmount} por ${feeName}]`;
        }
      }

      await apiRequest("PATCH", `/api/cash/movements/${editingMovement.id}`, {
        ...editForm,
        description: finalDescription,
        amount: finalAmount,
        associatedCost: finalAssociatedCost || null,
      });
      toast({ title: "Movimiento actualizado" });
      setEditDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }


  const activeMovements = canUseSessions && openSession
    ? movements.filter(m => m.sessionId === openSession.id)
    : (!canUseSessions ? movements.filter(m => m.createdAt && new Date(m.createdAt).toDateString() === new Date().toDateString()) : []);

  const totalIncome = activeMovements
    .filter((m) => m.type === "ingreso")
    .reduce((acc, m) => acc + parseFloat(m.amount), 0);

  const totalExpense = activeMovements
    .filter((m) => m.type === "egreso")
    .reduce((acc, m) => acc + parseFloat(m.amount), 0);

  const openingBalance = openSession ? parseFloat(openSession.openingAmount) : 0;
  const currentBalance = openingBalance + totalIncome - totalExpense;

  function handleVoiceResult() {
    setShowVoice(false);
    queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
  }

  function formatDate(d: string | Date | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const definitionOptions = expenseDefinitions.filter((d) => d.isActive);

  const movementTypeChange = (value: string) => {
    setNewMovement((prev) => ({
      ...prev,
      type: value,
      expenseDefinitionId: value === "egreso" ? prev.expenseDefinitionId : "",
    }));
  };

  const definitionLabel = (def: ExpenseDefinition) =>
    `${def.name}${def.category ? ` · ${def.category}` : ""}${def.type === "FIXED" ? " (Fijo)" : " (Variable)"}`;

  const activeTab = new URLSearchParams(window.location.search).get("tab") || "movements";

  return (
    <Tabs defaultValue={activeTab} className="space-y-4">
      <TabsList className="grid grid-cols-2 lg:w-[360px]">
        <TabsTrigger value="movements">Movimientos</TabsTrigger>
        <TabsTrigger value="kpis">Indicadores</TabsTrigger>
      </TabsList>
      <TabsContent value="movements">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Caja</h1>
              <p className="text-muted-foreground">
                Control de ingresos y egresos
                {!canUseSessions && (
                  <span className="ml-2 text-xs">(modo simple)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isTenantAdmin && (
                <Button
                  variant="outline"
                  onClick={() => setDefinitionsOpen(true)}
                  data-testid="button-expenses-settings"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar gastos
                </Button>
              )}
              {canUseSTT && !showVoice && (
                <Button variant="outline" onClick={() => setShowVoice(true)} data-testid="button-voice-cash">
                  <Mic className="w-4 h-4 mr-2" />
                  Dictar
                </Button>
              )}
              {canUseSessions ? (
                <>
                  {!openSession ? (
                    <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-open-session">
                          <DoorOpen className="w-4 h-4 mr-2" />
                          Abrir Caja
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Abrir Caja</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={openCashSession} className="space-y-4">
                          <div className="space-y-2">
                            <Label>Monto Inicial</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={openingAmount}
                              onChange={(e) => setOpeningAmount(e.target.value)}
                              data-testid="input-opening-amount"
                            />
                          </div>
                          <Button type="submit" className="w-full" data-testid="button-confirm-open">
                            Abrir Caja
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <>
                      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                          <Button data-testid="button-add-movement">
                            <Plus className="w-4 h-4 mr-2" />
                            Movimiento
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Nuevo Movimiento</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={addMovement} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select value={newMovement.type} onValueChange={movementTypeChange}>
                                  <SelectTrigger data-testid="select-movement-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ingreso">Ingreso</SelectItem>
                                    <SelectItem value="egreso">Egreso</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Monto</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={newMovement.amount}
                                  onChange={(e) => setNewMovement({ ...newMovement, amount: e.target.value })}
                                  required
                                  data-testid="input-movement-amount"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Método</Label>
                                <Select value={newMovement.method} onValueChange={(v) => setNewMovement({ ...newMovement, method: v })}>
                                  <SelectTrigger data-testid="select-movement-method">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="efectivo">Efectivo</SelectItem>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Categoría</Label>
                                <Input
                                  placeholder="Ej: Venta mostradores / Pago proveedor"
                                  value={newMovement.category}
                                  onChange={(e) => setNewMovement({ ...newMovement, category: e.target.value })}
                                  data-testid="input-movement-category"
                                />
                              </div>
                            </div>
                            {newMovement.type === "egreso" && (
                              <div className="space-y-2">
                                <Label>Gasto (opcional)</Label>
                                <Select
                                  value={newMovement.expenseDefinitionId}
                                  onValueChange={(v) => setNewMovement({ ...newMovement, expenseDefinitionId: v })}
                                >
                                  <SelectTrigger data-testid="select-movement-expense-definition">
                                    <SelectValue placeholder="Seleccionar gasto" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {definitionOptions.length === 0 ? (
                                      <SelectItem value="__empty__" disabled>
                                        Sin gastos configurados
                                      </SelectItem>
                                    ) : (
                                      definitionOptions.map((definition) => (
                                        <SelectItem key={definition.id} value={String(definition.id)}>
                                          {definitionLabel(definition)}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {newMovement.type === "ingreso" && (
                              <div className="space-y-3 bg-secondary/30 p-3 rounded border">
                                <div>
                                  <Label className="text-xs text-muted-foreground uppercase mb-1 block">Tarifa Extra / Costo Asociado (Opcional)</Label>
                                  <div className="flex flex-col gap-2 mb-2">
                                    <div className="flex gap-2">
                                      <Select
                                        value={newMovement.associatedCostType}
                                        onValueChange={(v) => setNewMovement({ ...newMovement, associatedCostType: v })}
                                      >
                                        <SelectTrigger className="w-[140px] shrink-0 text-xs h-9">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="costo">Gasto / Costo (-)</SelectItem>
                                          <SelectItem value="ingreso">Cobro Extra (+)</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        placeholder="Concepto (ej: Envío)"
                                        value={newMovement.associatedCostName}
                                        onChange={(e) => setNewMovement({ ...newMovement, associatedCostName: e.target.value })}
                                        className="flex-1 h-9"
                                      />
                                    </div>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Importe $ 0.00"
                                      value={newMovement.associatedCost}
                                      onChange={(e) => setNewMovement({ ...newMovement, associatedCost: e.target.value })}
                                      className="w-full h-9"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  {newAdditionalFees.map((fee, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-3">
                                        <Select value={fee.type} onValueChange={(v) => setNewAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, type: v as "costo" | "ingreso" } : f))}>
                                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                          <SelectContent><SelectItem value="costo">Costo (-)</SelectItem><SelectItem value="ingreso">Ingreso (+)</SelectItem></SelectContent>
                                        </Select>
                                      </div>
                                      <Input className="col-span-4 h-9" placeholder="Concepto" value={fee.name} onChange={(e) => setNewAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))} />
                                      <Input className="col-span-3 h-9" type="number" step="0.01" placeholder="0.00" value={fee.amount} onChange={(e) => setNewAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, amount: e.target.value } : f))} />
                                      <Button type="button" variant="ghost" className="col-span-2" onClick={() => setNewAdditionalFees((prev) => prev.filter((_, i) => i !== idx))}>Quitar</Button>
                                      <label className="col-span-12 text-xs flex items-center gap-2"><input type="checkbox" checked={fee.impactNetProfit} onChange={(e) => setNewAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, impactNetProfit: e.target.checked } : f))} />Impacta caja</label>
                                    </div>
                                  ))}
                                  <Button type="button" variant="outline" size="sm" onClick={() => setNewAdditionalFees((prev) => [...prev, { name: "", amount: "", type: "costo", impactNetProfit: true }])}>+ Agregar tarifa extra</Button>
                                </div>
                                {(parseFloat(newMovement.associatedCost || "0") > 0) && (
                                  <div className="flex items-start flex-col gap-1 mt-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                      <input
                                        type="checkbox"
                                        checked={newMovement.impactNetProfit}
                                        onChange={(e) => setNewMovement({ ...newMovement, impactNetProfit: e.target.checked })}
                                        className="rounded border-gray-300 text-chart-2 focus:ring-chart-2"
                                      />
                                      Impactar este monto en mi caja
                                    </label>
                                    {!newMovement.impactNetProfit ? (
                                      <p className="text-[10px] text-muted-foreground ml-6 leading-tight">
                                        Solo quedará asentado como comentario ilustrativo sin modificar tu contabilidad total.
                                      </p>
                                    ) : (
                                      <p className="text-[11px] font-semibold ml-6 px-2 py-1 bg-chart-2/10 text-chart-2 rounded uppercase border border-chart-2/20">
                                        {newMovement.associatedCostType === "ingreso"
                                          ? "Se sumará al ingreso reportado"
                                          : "Se restará de mi ingreso neto"
                                        }
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label>Descripción</Label>
                              <Input
                                placeholder="Ej: Pago de servicio de luz / Cobro mesa 4"
                                value={newMovement.description}
                                onChange={(e) => setNewMovement({ ...newMovement, description: e.target.value })}
                                data-testid="input-movement-description"
                              />
                            </div>
                            <Button type="submit" className="w-full" data-testid="button-submit-movement">
                              Registrar Movimiento
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" data-testid="button-close-session">
                            <DoorClosed className="w-4 h-4 mr-2" />
                            Cerrar Caja
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Cerrar Caja</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={closeCashSession} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Monto de Cierre</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={closingAmount}
                                onChange={(e) => setClosingAmount(e.target.value)}
                                data-testid="input-closing-amount"
                              />
                            </div>
                            <Button type="submit" className="w-full" data-testid="button-confirm-close">
                              Cerrar Caja
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-movement">
                        <Plus className="w-4 h-4 mr-2" />
                        Movimiento
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Nuevo Movimiento</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={addMovement} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select value={newMovement.type} onValueChange={movementTypeChange}>
                              <SelectTrigger data-testid="select-movement-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ingreso">Ingreso</SelectItem>
                                <SelectItem value="egreso">Egreso</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Monto</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={newMovement.amount}
                              onChange={(e) => setNewMovement({ ...newMovement, amount: e.target.value })}
                              required
                              data-testid="input-movement-amount"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Descripción</Label>
                          <Input
                            placeholder="Ej: Pago de servicio de luz / Cobro mesa 4"
                            value={newMovement.description}
                            onChange={(e) => setNewMovement({ ...newMovement, description: e.target.value })}
                            data-testid="input-movement-description"
                          />
                        </div>
                        {newMovement.type === "egreso" && (
                          <div className="space-y-2">
                            <Label>Gasto (opcional)</Label>
                            <Select
                              value={newMovement.expenseDefinitionId}
                              onValueChange={(v) => setNewMovement({ ...newMovement, expenseDefinitionId: v })}
                            >
                              <SelectTrigger data-testid="select-movement-expense-definition">
                                <SelectValue placeholder="Seleccionar gasto" />
                              </SelectTrigger>
                              <SelectContent>
                                {definitionOptions.length === 0 ? (
                                  <SelectItem value="__empty__" disabled>
                                    Sin gastos configurados
                                  </SelectItem>
                                ) : (
                                  definitionOptions.map((definition) => (
                                    <SelectItem key={definition.id} value={String(definition.id)}>
                                      {definitionLabel(definition)}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {newMovement.type === "ingreso" && (
                          <div className="space-y-3 bg-secondary/30 p-3 rounded border">
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase mb-1 block">Tarifa Extra / Costo Asociado (Opcional)</Label>
                              <div className="flex flex-col gap-2 mb-2">
                                <div className="flex gap-2">
                                  <Select
                                    value={newMovement.associatedCostType}
                                    onValueChange={(v) => setNewMovement({ ...newMovement, associatedCostType: v })}
                                  >
                                    <SelectTrigger className="w-[140px] shrink-0 text-xs h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="costo">Gasto / Costo (-)</SelectItem>
                                      <SelectItem value="ingreso">Cobro Extra (+)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    placeholder="Concepto (ej: Envío)"
                                    value={newMovement.associatedCostName}
                                    onChange={(e) => setNewMovement({ ...newMovement, associatedCostName: e.target.value })}
                                    className="flex-1 h-9"
                                  />
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Importe $ 0.00"
                                  value={newMovement.associatedCost}
                                  onChange={(e) => setNewMovement({ ...newMovement, associatedCost: e.target.value })}
                                  className="w-full h-9"
                                />
                              </div>
                            </div>
                            {(parseFloat(newMovement.associatedCost || "0") > 0) && (
                              <div className="flex items-start flex-col gap-1 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                  <input
                                    type="checkbox"
                                    checked={newMovement.impactNetProfit}
                                    onChange={(e) => setNewMovement({ ...newMovement, impactNetProfit: e.target.checked })}
                                    className="rounded border-gray-300 text-chart-2 focus:ring-chart-2"
                                  />
                                  Impactar este monto en mi caja
                                </label>
                                {!newMovement.impactNetProfit ? (
                                  <p className="text-[10px] text-muted-foreground ml-6 leading-tight">
                                    Solo quedará asentado como comentario ilustrativo sin modificar tu contabilidad total.
                                  </p>
                                ) : (
                                  <p className="text-[11px] font-semibold ml-6 px-2 py-1 bg-chart-2/10 text-chart-2 rounded uppercase border border-chart-2/20">
                                    {newMovement.associatedCostType === "ingreso"
                                      ? "Se sumará al ingreso reportado"
                                      : "Se restará de mi ingreso neto"
                                    }
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <Button type="submit" className="w-full" data-testid="button-submit-movement">
                          Registrar Movimiento
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Editar Movimiento</DialogTitle>
              </DialogHeader>
              <form onSubmit={updateMovement} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    required
                  />
                </div>
                {editingMovement?.type === "ingreso" && (
                  <div className="space-y-3 bg-secondary/30 p-3 rounded border">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase mb-1 block">Configurar Tarifa / Costo Adicional</Label>
                      <div className="flex gap-2 flex-col mb-2">
                        <div className="flex gap-2">
                          <Select
                            value={editForm.associatedCostType}
                            onValueChange={(v) => setEditForm({ ...editForm, associatedCostType: v })}
                          >
                            <SelectTrigger className="w-[140px] shrink-0 text-xs h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="costo">Gasto / Costo (-)</SelectItem>
                              <SelectItem value="ingreso">Cobro Extra (+)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Nombre ej: Costo Envío"
                            value={editForm.associatedCostName}
                            onChange={(e) => setEditForm({ ...editForm, associatedCostName: e.target.value })}
                            className="flex-1 h-9"
                          />
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="$ 0.00"
                          value={editForm.associatedCost}
                          onChange={(e) => setEditForm({ ...editForm, associatedCost: e.target.value })}
                          className="w-full h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      {editAdditionalFees.map((fee, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-3">
                            <Select value={fee.type} onValueChange={(v) => setEditAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, type: v as "costo" | "ingreso" } : f))}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="costo">Costo (-)</SelectItem><SelectItem value="ingreso">Ingreso (+)</SelectItem></SelectContent>
                            </Select>
                          </div>
                          <Input className="col-span-4 h-9" placeholder="Concepto" value={fee.name} onChange={(e) => setEditAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))} />
                          <Input className="col-span-3 h-9" type="number" step="0.01" placeholder="0.00" value={fee.amount} onChange={(e) => setEditAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, amount: e.target.value } : f))} />
                          <Button type="button" variant="ghost" className="col-span-2" onClick={() => setEditAdditionalFees((prev) => prev.filter((_, i) => i !== idx))}>Quitar</Button>
                          <label className="col-span-12 text-xs flex items-center gap-2"><input type="checkbox" checked={fee.impactNetProfit} onChange={(e) => setEditAdditionalFees((prev) => prev.map((f, i) => i === idx ? { ...f, impactNetProfit: e.target.checked } : f))} />Impacta caja</label>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditAdditionalFees((prev) => [...prev, { name: "", amount: "", type: "costo", impactNetProfit: true }])}>+ Agregar tarifa extra</Button>
                    </div>
                    {parseFloat(editForm.associatedCost || "0") > 0 && (
                      <div className="flex items-start flex-col gap-1 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={editForm.impactNetProfit}
                            onChange={(e) => setEditForm({ ...editForm, impactNetProfit: e.target.checked })}
                            className="rounded border-gray-300 text-chart-2 focus:ring-chart-2"
                          />
                          Impactar en movimiento
                        </label>
                        {editForm.impactNetProfit ? (
                          <p className="text-xs font-semibold text-chart-2 ml-6 px-2 py-1 bg-chart-2/10 rounded">
                            {editForm.associatedCostType === "ingreso"
                              ? `Cobro Recalculado: $${(parseFloat(editForm.amount || "0") + parseFloat(editForm.associatedCost || "0")).toLocaleString("es-AR")}`
                              : `Neta Recalculada: $${(parseFloat(editForm.amount || "0") - parseFloat(editForm.associatedCost || "0")).toLocaleString("es-AR")}`
                            }
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground ml-6 leading-tight">
                            El costo será ilustrativo en la descripción y <b>NO</b> modificará los montos de dinero de la caja.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Método</Label>
                  <Select value={editForm.method} onValueChange={(v) => setEditForm({ ...editForm, method: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo / Caja</SelectItem>
                      <SelectItem value="transferencia">Transferencia / Banco</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="posnet">POSNET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full">Guardar Cambios</Button>
              </form>
            </DialogContent>
          </Dialog>

          {showVoice && (
            <VoiceCommand
              context="cash"
              onResult={handleVoiceResult}
              onCancel={() => setShowVoice(false)}
            />
          )}

          {isTenantAdmin && (
            <ExpenseDefinitionsDialog
              open={definitionsOpen}
              onOpenChange={(open) => {
                setDefinitionsOpen(open);
                if (!open) refreshExpenseDefinitions();
              }}
            />
          )}

          {!canUseSessions && (
            <Card className="border-chart-4/30">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Tu plan <Badge variant="secondary">{plan?.name}</Badge> incluye caja simple (ingresos/egresos).
                    Mejorá al plan Profesional para usar apertura/cierre de sesión y movimientos categorizados.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {canUseSessions && openSession && (
            <Card className="border-primary/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-chart-2 animate-pulse" />
                  <span className="text-sm font-medium">Caja Abierta</span>
                  <Badge variant="outline">Desde {formatDate(openSession.openedAt)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Apertura: ${parseFloat(openSession.openingAmount).toLocaleString("es-AR")}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Ingresos</p>
                    <p className="text-2xl font-bold text-chart-2" data-testid="text-total-income">
                      ${totalIncome.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-chart-2" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Egresos</p>
                    <p className="text-2xl font-bold text-destructive" data-testid="text-total-expenses">
                      ${totalExpense.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <ArrowDownRight className="w-5 h-5 text-destructive" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Balance</p>
                    <p className={`text-2xl font-bold ${currentBalance >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      ${currentBalance.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <Wallet className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Movimientos</h3>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : activeMovements.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No hay movimientos registrados en esta sesión</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {activeMovements.map((m) => {
                  const hasAssociatedCost = m.type === "ingreso" && parseFloat(m.associatedCost || "0") > 0;
                  const netProfit = m.type === "ingreso" ? parseFloat(m.amount) - parseFloat(m.associatedCost || "0") : 0;
                  return (
                    <Card
                      key={m.id}
                      data-testid={`card-movement-${m.id}`}
                      className="cursor-pointer hover:border-sidebar-accent transition-colors"
                      onClick={() => {
                        setEditingMovement(m);
                        setEditForm({
                          amount: m.amount,
                          associatedCost: m.associatedCost || "",
                          associatedCostName: "",
                          associatedCostType: "costo",
                          impactNetProfit: parseFloat(m.associatedCost || "0") > 0,
                          category: m.category || "",
                          description: m.description || "",
                          method: m.method || "efectivo",
                        });
                        setEditAdditionalFees([]);
                        setEditDialogOpen(true);
                      }}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-md ${m.type === "ingreso" ? "bg-chart-2/10" : "bg-destructive/10"}`}>
                              {m.type === "ingreso" ? (
                                <ArrowUpRight className="w-4 h-4 text-chart-2" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-destructive" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {m.expenseDefinitionName || m.description || m.category || m.type}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{m.method}</span>
                                {m.expenseDefinitionName && (
                                  <Badge variant="outline" className="text-xs">
                                    {m.expenseDefinitionName}
                                  </Badge>
                                )}
                                {m.category && (
                                  <Badge variant="secondary" className="text-xs">{m.category}</Badge>
                                )}
                                {hasAssociatedCost && (
                                  <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded ml-1 font-medium">
                                    Costo Asociado: -${parseFloat(m.associatedCost || "0").toLocaleString("es-AR")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${m.type === "ingreso" ? "text-chart-2" : "text-destructive"}`}>
                              {m.type === "ingreso" ? "+" : "-"}${parseFloat(m.amount).toLocaleString("es-AR")}
                            </p>
                            {hasAssociatedCost && (
                              <p className="text-[11px] font-semibold text-chart-2 mt-0.5" title="Monto ingresado restante y limpio hacia tu bolsillo (Ganancia Neta)">
                                Neto: ${netProfit.toLocaleString("es-AR")}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(m.createdAt)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="kpis"><div className="space-y-3"><h2 className="text-xl font-semibold">Indicador Clave Desempeño</h2><ReportsDashboardPage /></div></TabsContent>
    </Tabs>
  );
}
