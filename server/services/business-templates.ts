import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  businessTemplates,
  optionLists,
  optionListItems,
  orderFieldDefinitions,
  orderTypeDefinitions,
  orderTypePresets,
  productCategories,
  productFieldDefinitions,
  tenantConfig,
} from "@shared/schema";
import { mergeTrackingSettings } from "@shared/tracking-settings";
import { notFound } from "../lib/http-errors";

export type TemplateApplyResult = {
  templateCode: string;
  createdPresets: number;
  createdFields: number;
  createdOptionLists: number;
};

type TemplateConfig = {
  trackingSettings?: Record<string, unknown>;
  optionLists?: Array<{
    key: string;
    name: string;
    entityScope?: string | null;
    items?: Array<{ value: string; label: string }>;
  }>;
  orderFields?: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    required?: boolean;
    sortOrder?: number;
    config?: Record<string, unknown>;
    visibleInTracking?: boolean;
  }>;
  productFields?: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    required?: boolean;
    sortOrder?: number;
    config?: Record<string, unknown>;
  }>;
  presets?: Array<{
    code: string;
    label: string;
    isDefault?: boolean;
    sortOrder?: number;
    fieldKeys?: string[];
  }>;
  productCategories?: string[];
};

function slug(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export async function applyBusinessTemplate(tenantId: number, templateCode: string): Promise<TemplateApplyResult> {
  const code = String(templateCode || "").trim().toUpperCase();
  const [template] = await db.select().from(businessTemplates).where(eq(businessTemplates.code, code));
  if (!template) throw notFound("TEMPLATE_NOT_FOUND", "Plantilla de negocio no encontrada");

  const cfg = (template.config || {}) as TemplateConfig;

  let createdOptionLists = 0;
  let createdFields = 0;
  let createdPresets = 0;

  await db.transaction(async (tx) => {
    const typeCode = "GENERAL";
    let [orderType] = await tx
      .select()
      .from(orderTypeDefinitions)
      .where(and(eq(orderTypeDefinitions.tenantId, tenantId), eq(orderTypeDefinitions.code, typeCode)));

    if (!orderType) {
      [orderType] = await tx
        .insert(orderTypeDefinitions)
        .values({ tenantId, code: typeCode, label: "General", isActive: true })
        .returning();
    }

    const listIdByKey = new Map<string, number>();
    for (const list of cfg.optionLists || []) {
      const listKey = slug(list.key);
      if (!listKey) continue;
      let [existingList] = await tx
        .select()
        .from(optionLists)
        .where(and(eq(optionLists.tenantId, tenantId), eq(optionLists.key, listKey)));

      if (!existingList) {
        [existingList] = await tx
          .insert(optionLists)
          .values({ tenantId, key: listKey, name: list.name, entityScope: list.entityScope || null })
          .returning();
        createdOptionLists += 1;
      }
      listIdByKey.set(listKey, existingList.id);

      const listItems = list.items || [];
      for (let idx = 0; idx < listItems.length; idx += 1) {
        const item = listItems[idx];
        const value = String(item.value || "").trim();
        if (!value) continue;
        const [existingItem] = await tx
          .select()
          .from(optionListItems)
          .where(and(eq(optionListItems.listId, existingList.id), eq(optionListItems.value, value)));

        if (!existingItem) {
          await tx.insert(optionListItems).values({
            listId: existingList.id,
            value,
            label: String(item.label || value),
            sortOrder: idx,
            isActive: true,
          });
        }
      }
    }

    const presetByCode = new Map<string, number>();
    for (const preset of cfg.presets || []) {
      const presetCode = slug(preset.code);
      if (!presetCode) continue;
      let [existingPreset] = await tx
        .select()
        .from(orderTypePresets)
        .where(
          and(
            eq(orderTypePresets.tenantId, tenantId),
            eq(orderTypePresets.orderTypeId, orderType.id),
            eq(orderTypePresets.code, presetCode)
          )
        );

      if (!existingPreset) {
        [existingPreset] = await tx
          .insert(orderTypePresets)
          .values({
            tenantId,
            orderTypeId: orderType.id,
            code: presetCode,
            label: preset.label,
            isDefault: Boolean(preset.isDefault),
            isActive: true,
            sortOrder: preset.sortOrder || 0,
          })
          .returning();
        createdPresets += 1;
      }
      presetByCode.set(presetCode, existingPreset.id);
    }

    for (const preset of cfg.presets || []) {
      if (!preset.isDefault) continue;
      const presetCode = slug(preset.code);
      const defaultPresetId = presetByCode.get(presetCode);
      if (!defaultPresetId) continue;
      await tx
        .update(orderTypePresets)
        .set({ isDefault: false })
        .where(and(eq(orderTypePresets.tenantId, tenantId), eq(orderTypePresets.orderTypeId, orderType.id)));
      await tx
        .update(orderTypePresets)
        .set({ isDefault: true })
        .where(and(eq(orderTypePresets.tenantId, tenantId), eq(orderTypePresets.id, defaultPresetId)));
      break;
    }

    for (const field of cfg.orderFields || []) {
      const fieldKey = slug(field.fieldKey);
      if (!fieldKey) continue;
      const targetPreset = (cfg.presets || []).find((preset) => (preset.fieldKeys || []).includes(field.fieldKey));
      const presetId = targetPreset ? presetByCode.get(slug(targetPreset.code)) ?? null : null;
      const fieldConfig = { ...(field.config || {}) } as Record<string, unknown>;
      const optionListKey = typeof fieldConfig.optionListKey === "string" ? slug(fieldConfig.optionListKey) : null;
      if (optionListKey && listIdByKey.has(optionListKey)) {
        fieldConfig.optionListKey = optionListKey;
      }

      let existingField = null;
      if (presetId) {
        [existingField] = await tx
          .select()
          .from(orderFieldDefinitions)
          .where(
            and(
              eq(orderFieldDefinitions.tenantId, tenantId),
              eq(orderFieldDefinitions.orderTypeId, orderType.id),
              eq(orderFieldDefinitions.presetId, presetId),
              eq(orderFieldDefinitions.fieldKey, fieldKey)
            )
          );
      }

      if (!existingField) {
        [existingField] = await tx
          .select()
          .from(orderFieldDefinitions)
          .where(
            and(
              eq(orderFieldDefinitions.tenantId, tenantId),
              eq(orderFieldDefinitions.orderTypeId, orderType.id),
              eq(orderFieldDefinitions.fieldKey, fieldKey)
            )
          );
      }

      if (!existingField) {
        await tx.insert(orderFieldDefinitions).values({
          tenantId,
          orderTypeId: orderType.id,
          presetId,
          fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: Boolean(field.required),
          sortOrder: field.sortOrder || 0,
          config: fieldConfig,
          isActive: true,
          visibleInTracking: field.visibleInTracking ?? true,
        });
        createdFields += 1;
      }
    }

    for (const field of cfg.productFields || []) {
      const fieldKey = slug(field.fieldKey);
      if (!fieldKey) continue;
      const fieldConfig = { ...(field.config || {}) } as Record<string, unknown>;
      const optionListKey = typeof fieldConfig.optionListKey === "string" ? slug(fieldConfig.optionListKey) : null;
      if (optionListKey && listIdByKey.has(optionListKey)) {
        fieldConfig.optionListKey = optionListKey;
      }

      const [existingField] = await tx
        .select()
        .from(productFieldDefinitions)
        .where(and(eq(productFieldDefinitions.tenantId, tenantId), eq(productFieldDefinitions.fieldKey, fieldKey)));

      if (!existingField) {
        await tx.insert(productFieldDefinitions).values({
          tenantId,
          fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: Boolean(field.required),
          sortOrder: field.sortOrder || 0,
          config: fieldConfig,
          isActive: true,
        });
        createdFields += 1;
      }
    }

    const categories = cfg.productCategories || [];
    for (let idx = 0; idx < categories.length; idx += 1) {
      const category = categories[idx];
      const name = String(category || "").trim();
      if (!name) continue;
      const [existingCategory] = await tx
        .select()
        .from(productCategories)
        .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.name, name)));
      if (!existingCategory) {
        await tx.insert(productCategories).values({ tenantId, name, sortOrder: idx });
      }
    }

    if (cfg.trackingSettings) {
      const [currentConfig] = await tx.select().from(tenantConfig).where(eq(tenantConfig.tenantId, tenantId));
      const mergedTracking = mergeTrackingSettings(cfg.trackingSettings);
      if (!currentConfig) {
        await tx.insert(tenantConfig).values({ tenantId, trackingSettings: mergedTracking as any });
      } else {
        await tx
          .update(tenantConfig)
          .set({ trackingSettings: mergedTracking as any })
          .where(eq(tenantConfig.tenantId, tenantId));
      }
    }
  });

  return {
    templateCode: code,
    createdPresets,
    createdFields,
    createdOptionLists,
  };
}
