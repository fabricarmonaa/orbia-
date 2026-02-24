import { OrderPresetsSettings } from "@/components/settings/OrderPresetsSettings";

export default function SettingsOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración de pedidos</h1>
        <p className="text-muted-foreground">Gestioná presets y campos custom por tipo de pedido.</p>
      </div>
      <OrderPresetsSettings />
    </div>
  );
}
