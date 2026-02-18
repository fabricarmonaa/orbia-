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
    expenseDefinitionId: "",
  });

  const [openingAmount, setOpeningAmount] = useState("");
  const [closingAmount, setClosingAmount] = useState("");

  useEffect(() => {
    fetchData();
  }, [canUseSessions]);

  const refreshExpenseDefinitions = () => {
    getExpenseDefinitions()
      .then((data) => setExpenseDefinitions(data || []))
      .catch(() => {});
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
      await apiRequest("POST", "/api/cash/movements", {
        ...newMovement,
        amount: parseFloat(newMovement.amount),
        sessionId: openSession?.id || null,
        expenseDefinitionId: newMovement.expenseDefinitionId
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
        expenseDefinitionId: "",
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const totalIncome = movements
    .filter((m) => m.type === "ingreso")
    .reduce((acc, m) => acc + parseFloat(m.amount), 0);

  const totalExpense = movements
    .filter((m) => m.type === "egreso")
    .reduce((acc, m) => acc + parseFloat(m.amount), 0);

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

  return (
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
                              placeholder="Ej: Ventas"
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
                        <div className="space-y-2">
                          <Label>Descripción</Label>
                          <Input
                            placeholder="Detalle del movimiento"
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
                        placeholder="Detalle del movimiento"
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
                <p className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? "text-chart-2" : "text-destructive"}`}>
                  ${(totalIncome - totalExpense).toLocaleString("es-AR")}
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
        ) : movements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No hay movimientos registrados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {movements.map((m) => (
              <Card key={m.id} data-testid={`card-movement-${m.id}`}>
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
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${m.type === "ingreso" ? "text-chart-2" : "text-destructive"}`}>
                        {m.type === "ingreso" ? "+" : "-"}${parseFloat(m.amount).toLocaleString("es-AR")}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
