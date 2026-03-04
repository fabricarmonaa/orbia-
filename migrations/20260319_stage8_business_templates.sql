-- ETAPA 8: plantillas de negocio para onboarding inteligente

CREATE TABLE IF NOT EXISTS business_templates (
  id serial PRIMARY KEY,
  code varchar(50) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_templates_code ON business_templates(code);

INSERT INTO business_templates (code, name, description, config)
VALUES
(
  'SERVICIO_TECNICO',
  'Servicio técnico',
  'Configura presets y campos recomendados para reparaciones y seguimiento técnico.',
  $$
  {
    "trackingSettings": { "showOrderNumber": true, "showOrderType": true, "showDates": true, "showHistory": true, "showOnlyCurrentStatus": false },
    "optionLists": [
      { "key": "tecnicos_asignados", "name": "Técnicos asignados", "entityScope": "ORDER", "items": [] },
      { "key": "estado_servicio", "name": "Estado del servicio", "entityScope": "ORDER", "items": [
        {"value":"RECIBIDO","label":"Recibido"},
        {"value":"EN_DIAGNOSTICO","label":"En diagnóstico"},
        {"value":"EN_REPARACION","label":"En reparación"},
        {"value":"LISTO","label":"Listo"},
        {"value":"ENTREGADO","label":"Entregado"}
      ] }
    ],
    "orderFields": [
      {"fieldKey":"equipo","label":"Equipo","fieldType":"TEXT","required":true,"sortOrder":10,"config":{},"visibleInTracking":true},
      {"fieldKey":"marca","label":"Marca","fieldType":"TEXT","required":false,"sortOrder":20,"config":{},"visibleInTracking":true},
      {"fieldKey":"modelo","label":"Modelo","fieldType":"TEXT","required":false,"sortOrder":30,"config":{},"visibleInTracking":true},
      {"fieldKey":"falla_reportada","label":"Falla reportada","fieldType":"TEXTAREA","required":true,"sortOrder":40,"config":{},"visibleInTracking":true},
      {"fieldKey":"tecnico_asignado","label":"Técnico asignado","fieldType":"SELECT","required":false,"sortOrder":50,"config":{"optionListKey":"tecnicos_asignados"},"visibleInTracking":true},
      {"fieldKey":"repuestos","label":"Repuestos","fieldType":"MONEY","required":false,"sortOrder":60,"config":{"defaultDirection":-1,"currency":"ARS"},"visibleInTracking":false},
      {"fieldKey":"mano_obra","label":"Mano de obra","fieldType":"MONEY","required":false,"sortOrder":70,"config":{"defaultDirection":1,"currency":"ARS"},"visibleInTracking":false}
    ],
    "productFields": [],
    "presets": [
      {"code":"reparacion_tecnica","label":"Reparación técnica","isDefault":true,"sortOrder":1,"fieldKeys":["equipo","marca","modelo","falla_reportada","tecnico_asignado","repuestos","mano_obra"]}
    ],
    "productCategories": []
  }
  $$::jsonb
),
(
  'TIENDA_ROPA',
  'Tienda de ropa',
  'Configura presets y listas para ventas de indumentaria.',
  $$
  {
    "trackingSettings": { "showOrderNumber": true, "showOrderType": false, "showDates": true, "showHistory": false, "showOnlyCurrentStatus": true },
    "optionLists": [
      { "key": "categorias", "name": "Categorías", "entityScope": "PRODUCT", "items": [
        {"value":"REMERAS","label":"Remeras"},
        {"value":"PANTALONES","label":"Pantalones"},
        {"value":"CAMPERAS","label":"Camperas"},
        {"value":"ACCESORIOS","label":"Accesorios"}
      ] },
      { "key": "talles", "name": "Talles", "entityScope": "PRODUCT", "items": [
        {"value":"XS","label":"XS"},
        {"value":"S","label":"S"},
        {"value":"M","label":"M"},
        {"value":"L","label":"L"},
        {"value":"XL","label":"XL"}
      ] }
    ],
    "orderFields": [
      {"fieldKey":"descuento","label":"Descuento","fieldType":"MONEY","required":false,"sortOrder":10,"config":{"defaultDirection":-1,"currency":"ARS"},"visibleInTracking":false}
    ],
    "productFields": [
      {"fieldKey":"costo","label":"Costo","fieldType":"MONEY","required":false,"sortOrder":10,"config":{"defaultDirection":-1,"currency":"ARS"}},
      {"fieldKey":"categoria","label":"Categoría","fieldType":"SELECT","required":false,"sortOrder":20,"config":{"optionListKey":"categorias"}},
      {"fieldKey":"talle","label":"Talle","fieldType":"SELECT","required":false,"sortOrder":30,"config":{"optionListKey":"talles"}}
    ],
    "presets": [
      {"code":"venta_tienda","label":"Venta en tienda","isDefault":true,"sortOrder":1,"fieldKeys":["descuento"]}
    ],
    "productCategories": ["Remeras", "Pantalones", "Camperas", "Accesorios"]
  }
  $$::jsonb
),
(
  'GENERAL',
  'General',
  'Configuración base para cualquier negocio.',
  $$
  {
    "trackingSettings": { "showOrderNumber": true, "showOrderType": true, "showDates": true, "showHistory": true, "showOnlyCurrentStatus": false },
    "optionLists": [],
    "orderFields": [
      {"fieldKey":"descripcion","label":"Descripción","fieldType":"TEXTAREA","required":true,"sortOrder":10,"config":{},"visibleInTracking":true},
      {"fieldKey":"monto","label":"Monto","fieldType":"MONEY","required":false,"sortOrder":20,"config":{"defaultDirection":1,"currency":"ARS"},"visibleInTracking":false}
    ],
    "productFields": [],
    "presets": [
      {"code":"general","label":"General","isDefault":true,"sortOrder":1,"fieldKeys":["descripcion","monto"]}
    ],
    "productCategories": []
  }
  $$::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  config = EXCLUDED.config;
