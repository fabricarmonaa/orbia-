import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mapFieldTypeToInputKind } from "./input-mapping";

type OptionItem = { value: string; label: string };

interface Props {
  id: string;
  label: string;
  type: string;
  value: any;
  required?: boolean;
  options?: OptionItem[];
  onChange: (value: any) => void;
  error?: string;
}

export function DynamicFieldInput({ id, label, type, value, required, options = [], onChange, error }: Props) {
  const inputKind = mapFieldTypeToInputKind(type);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
      {inputKind === "TEXTAREA" ? (
        <Textarea id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      ) : inputKind === "BOOLEAN" ? (
        <div className="flex items-center gap-2"><Switch checked={Boolean(value)} onCheckedChange={onChange} /><span className="text-sm text-muted-foreground">{Boolean(value) ? "Sí" : "No"}</span></div>
      ) : inputKind === "SELECT" ? (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Seleccioná una opción" /></SelectTrigger>
          <SelectContent>
            {options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : inputKind === "MULTISELECT" ? (
        <Input id={id} value={Array.isArray(value) ? value.join(", ") : ""} onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="Separá opciones con coma" />
      ) : inputKind === "DATE" ? (
        <Input id={id} type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      ) : inputKind === "NUMBER" || inputKind === "MONEY" ? (
        <Input id={id} type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : inputKind === "FILE" ? (
        <p className="text-sm text-muted-foreground">Carga de archivo por campo no disponible en esta pantalla.</p>
      ) : (
        <Input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
