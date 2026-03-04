import { DynamicFieldInput } from "./DynamicFieldInput";

export interface DynamicFieldDefinition {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  config?: Record<string, any>;
}

interface Props {
  fields: DynamicFieldDefinition[];
  values: Record<number, any>;
  onChange: (fieldId: number, value: any) => void;
  errors?: Record<number, string>;
}

export function DynamicFieldsForm({ fields, values, onChange, errors = {} }: Props) {
  if (!fields.length) return <p className="text-sm text-muted-foreground">No hay campos opcionales configurados.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {fields.map((field) => {
        const options = Array.isArray(field.config?.optionsInline)
          ? field.config?.optionsInline
          : Array.isArray(field.config?.options)
            ? field.config?.options
            : [];
        return (
          <DynamicFieldInput
            key={field.id}
            id={`field-${field.id}`}
            label={field.label}
            type={field.fieldType}
            required={field.required}
            value={values[field.id]}
            options={options}
            onChange={(value) => onChange(field.id, value)}
            error={errors[field.id]}
          />
        );
      })}
    </div>
  );
}
