import { db, pool } from "../db";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { calculateSaleTotals, round2, validateStock } from "../services/sales-calculation";
import { resolveProductUnitPrice } from "../services/pricing";
import {
  branches,
  cashMovements,
  cashSessions,
  productStockByBranch,
  stockLevels,
  stockMovements,
  products,
  saleItems,
  sales,
  customers,
  tenantCounters,
  type InsertCashMovement,
} from "@shared/schema";

export type SaleAdjustmentType = "NONE" | "PERCENT" | "FIXED";

interface CreateSaleInput {
  tenantId: number;
  branchId: number | null;
  cashierUserId: number;
  currency: string;
  paymentMethod: string;
  notes: string | null;
  customerId?: number | null;
  hasBranchesFeature?: boolean;
  discountType: SaleAdjustmentType;
  discountValue: number;
  surchargeType: SaleAdjustmentType;
  surchargeValue: number;
  items: Array<{ productId: number; quantity: number; unitPrice?: number | null }>;
}


export const salesStorage = {
  async createSaleAtomic(input: CreateSaleInput) {
    return db.transaction(async (tx) => {
      const [branchCount] = await tx
        .select({ count: count() })
        .from(branches)
        .where(and(eq(branches.tenantId, input.tenantId), sql`${branches.deletedAt} IS NULL`));
      const hasBranches = Boolean(input.hasBranchesFeature) && (branchCount?.count || 0) > 0;
      const effectiveBranchId = hasBranches ? input.branchId : null;

      const requestedIds = Array.from(new Set(input.items.map((item) => item.productId)));
      const dbProducts = await tx.select().from(products).where(and(eq(products.tenantId, input.tenantId), inArray(products.id, requestedIds)));
      if (dbProducts.length !== requestedIds.length) {
        throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { code: "PRODUCT_NOT_FOUND" });
      }

      const productMap = new Map(dbProducts.map((item) => [item.id, item]));
      const stockByProduct = new Map<number, number>();

      if (hasBranches) {
        if (!effectiveBranchId) {
          throw Object.assign(new Error("BRANCH_REQUIRED"), { code: "BRANCH_REQUIRED" });
        }
        const stockRows = await tx
          .select()
          .from(productStockByBranch)
          .where(
            and(
              eq(productStockByBranch.tenantId, input.tenantId),
              eq(productStockByBranch.branchId, effectiveBranchId),
              inArray(productStockByBranch.productId, requestedIds)
            )
          );
        for (const row of stockRows) stockByProduct.set(row.productId, row.stock || 0);
      }

      const enrichedItems = await Promise.all(input.items.map(async (row) => {
        const product = productMap.get(row.productId)!;
        const pricingMode = String(product.pricingMode || "MANUAL").toUpperCase();
        if (pricingMode === "MARGIN" && row.unitPrice !== undefined && row.unitPrice !== null) {
          throw Object.assign(new Error("MARGIN_PRICE_OVERRIDE_NOT_ALLOWED"), { code: "MARGIN_PRICE_OVERRIDE_NOT_ALLOWED", productId: row.productId });
        }
        const resolvedPrice = await resolveProductUnitPrice(product as any, input.tenantId, input.currency);
        const unitPrice = pricingMode === "MANUAL" && row.unitPrice !== undefined && row.unitPrice !== null
          ? Number(row.unitPrice)
          : resolvedPrice;
        const available = hasBranches
          ? stockByProduct.get(row.productId) ?? 0
          : Number(product.stock || 0);
        const lineTotal = round2(unitPrice * row.quantity);
        return { ...row, product, available, unitPrice, lineTotal };
      }));

      const insufficient = enrichedItems.find((item) => !validateStock(item.available, item.quantity));
      if (insufficient) {
        throw Object.assign(new Error("INSUFFICIENT_STOCK"), {
          code: "INSUFFICIENT_STOCK",
          productId: insufficient.productId,
          requested: insufficient.quantity,
          available: insufficient.available,
        });
      }

      const { subtotal, discountAmount, surchargeAmount, totalAmount } = calculateSaleTotals({
        lineTotals: enrichedItems.map((item) => item.lineTotal),
        discountType: input.discountType,
        discountValue: input.discountValue,
        surchargeType: input.surchargeType,
        surchargeValue: input.surchargeValue,
      });

      const counterRows = await tx.insert(tenantCounters).values({ tenantId: input.tenantId, key: "sales", value: 1 }).onConflictDoUpdate({
        target: [tenantCounters.tenantId, tenantCounters.key],
        set: { value: sql`${tenantCounters.value} + 1`, updatedAt: new Date() },
      }).returning({ value: tenantCounters.value });
      const counter = Number(counterRows[0]?.value || 1);
      const saleNumber = `V-${String(counter).padStart(6, "0")}`;

      const [sale] = await tx
        .insert(sales)
        .values({
          tenantId: input.tenantId,
          branchId: effectiveBranchId,
          cashierUserId: input.cashierUserId,
          saleNumber,
          saleDatetime: new Date(),
          currency: input.currency,
          subtotalAmount: String(subtotal),
          discountType: input.discountType,
          discountValue: String(input.discountValue || 0),
          discountAmount: String(discountAmount),
          surchargeType: input.surchargeType,
          surchargeValue: String(input.surchargeValue || 0),
          surchargeAmount: String(surchargeAmount),
          totalAmount: String(totalAmount),
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          customerId: input.customerId ?? null,
        })
        .returning();

      await tx.insert(saleItems).values(
        enrichedItems.map((item) => ({
          saleId: sale.id,
          tenantId: input.tenantId,
          branchId: effectiveBranchId,
          productId: item.productId,
          productNameSnapshot: item.product.name,
          skuSnapshot: item.product.sku || null,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          lineTotal: String(item.lineTotal),
        }))
      );

      if (hasBranches && effectiveBranchId) {
        for (const item of enrichedItems) {
          const current = stockByProduct.get(item.productId) ?? 0;
          await tx
            .update(productStockByBranch)
            .set({ stock: current - item.quantity })
            .where(
              and(
                eq(productStockByBranch.tenantId, input.tenantId),
                eq(productStockByBranch.branchId, effectiveBranchId),
                eq(productStockByBranch.productId, item.productId)
              )
            );
        }
      } else {
        for (const item of enrichedItems) {
          const current = Number(item.product.stock || 0);
          await tx
            .update(products)
            .set({ stock: current - item.quantity })
            .where(and(eq(products.tenantId, input.tenantId), eq(products.id, item.productId)));
        }

      for (const item of enrichedItems) {
        const [level] = await tx
          .select()
          .from(stockLevels)
          .where(and(eq(stockLevels.tenantId, input.tenantId), eq(stockLevels.productId, item.productId), effectiveBranchId ? eq(stockLevels.branchId, effectiveBranchId) : sql`${stockLevels.branchId} IS NULL`));
        const currentLevel = Number(level?.quantity || 0);
        const nextLevel = currentLevel - item.quantity;
        if (nextLevel < 0) {
          throw Object.assign(new Error("INSUFFICIENT_STOCK"), { code: "INSUFFICIENT_STOCK", productId: item.productId, requested: item.quantity, available: currentLevel });
        }
        if (level) {
          await tx.update(stockLevels).set({ quantity: String(nextLevel), updatedAt: new Date() }).where(eq(stockLevels.id, level.id));
        } else {
          await tx.insert(stockLevels).values({ tenantId: input.tenantId, productId: item.productId, branchId: effectiveBranchId, quantity: String(nextLevel), averageCost: "0" });
        }
        await tx.insert(stockMovements).values({
          tenantId: input.tenantId,
          productId: item.productId,
          branchId: effectiveBranchId,
          movementType: "SALE",
          referenceId: sale.id,
          quantity: String(item.quantity),
          note: `Venta ${saleNumber}`,
          reason: `Venta ${saleNumber}`,
          createdByUserId: input.cashierUserId,
          userId: input.cashierUserId,
          unitCost: null,
          totalCost: null,
        });
      }

      }

      const [openSession] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, input.tenantId),
            eq(cashSessions.status, "open"),
            effectiveBranchId ? eq(cashSessions.branchId, effectiveBranchId) : sql`${cashSessions.branchId} IS NULL`
          )
        )
        .limit(1);

      const cashData: InsertCashMovement = {
        tenantId: input.tenantId,
        sessionId: openSession?.id || null,
        branchId: effectiveBranchId,
        type: "ingreso",
        amount: String(totalAmount),
        method: input.paymentMethod.toLowerCase(),
        category: "venta",
        description: `Venta ${saleNumber}`,
        expenseDefinitionId: null,
        expenseDefinitionName: null,
        orderId: null,
        saleId: sale.id,
        createdById: input.cashierUserId,
      };
      await tx.insert(cashMovements).values(cashData);

      return { sale };
    });
  },

  async listSales(tenantId: number, filters: { branchId?: number | null; from?: Date; to?: Date; number?: string; customerId?: number; customerQuery?: string; limit: number; offset: number; sort?: "date_desc" | "date_asc" | "number_desc" | "number_asc" }) {
    const normalizedLimit = Math.min(200, Math.max(1, Number(filters.limit || 50)));
    const normalizedOffset = Math.max(0, Number(filters.offset || 0));
    const sort = filters.sort || "date_desc";

    const orderByMV = {
      date_desc: 'h.sale_datetime DESC, h.id DESC',
      date_asc: 'h.sale_datetime ASC, h.id ASC',
      number_desc: 'h.sale_number DESC, h.id DESC',
      number_asc: 'h.sale_number ASC, h.id ASC',
    }[sort];

    const orderByTables = {
      date_desc: sql`${sales.saleDatetime} DESC, ${sales.id} DESC`,
      date_asc: sql`${sales.saleDatetime} ASC, ${sales.id} ASC`,
      number_desc: sql`${sales.saleNumber} DESC, ${sales.id} DESC`,
      number_asc: sql`${sales.saleNumber} ASC, ${sales.id} ASC`,
    }[sort] ?? sql`${sales.saleDatetime} DESC, ${sales.id} DESC`;

    const doesRelationExist = async (relationName: string) => {
      const result = await pool.query(`SELECT to_regclass($1) AS reg`, [relationName]);
      return Boolean(result.rows?.[0]?.reg);
    };

    const parseQueryForMV = () => {
      const whereSql: string[] = ["h.tenant_id = $1"];
      const params: any[] = [tenantId];

      if (filters.branchId !== undefined && filters.branchId !== null) {
        params.push(filters.branchId);
        whereSql.push(`h.branch_id = $${params.length}`);
      }
      if (filters.from) {
        params.push(filters.from);
        whereSql.push(`h.sale_datetime >= $${params.length}`);
      }
      if (filters.to) {
        params.push(filters.to);
        whereSql.push(`h.sale_datetime < $${params.length}`);
      }

      const numberFilter = String(filters.number || "").trim();
      if (numberFilter) {
        params.push(`%${numberFilter}%`);
        whereSql.push(`COALESCE(h.sale_number, '') ILIKE $${params.length}`);
      }

      if (filters.customerId && Number.isFinite(Number(filters.customerId))) {
        params.push(Number(filters.customerId));
        whereSql.push(`h.customer_id = $${params.length}`);
      }

      const customerQuery = String(filters.customerQuery || "").trim();
      if (customerQuery.length > 0) {
        const numericQuery = Number(customerQuery);
        if (Number.isFinite(numericQuery) && /^\d+$/.test(customerQuery)) {
          params.push(customerQuery);
          whereSql.push(`(COALESCE(h.sale_number, '') ILIKE '%' || $${params.length} || '%' OR CAST(h.id AS TEXT) = $${params.length})`);
        } else {
          params.push(`%${customerQuery}%`);
          whereSql.push(`(
            COALESCE(h.customer_name, '') ILIKE $${params.length}
            OR COALESCE(h.sale_number, '') ILIKE $${params.length}
          )`);
        }
      }

      return { whereSql, params };
    };

    const tryFromMV = async () => {
      const exists = await doesRelationExist("public.mv_sales_history");
      if (!exists) throw Object.assign(new Error("mv_sales_history_missing"), { code: "42P01" });

      const { whereSql, params } = parseQueryForMV();
      const countQuery = `SELECT COUNT(*)::int AS total FROM mv_sales_history h WHERE ${whereSql.join(" AND ")}`;
      const countRows = await pool.query(countQuery, params);

      const listParams = [...params, normalizedLimit, normalizedOffset];
      const listQuery = `
        SELECT
          h.id,
          h.sale_number AS number,
          h.sale_datetime AS "createdAt",
          h.payment_method AS "paymentMethod",
          h.total_amount AS total,
          h.currency,
          h.customer_id AS "customerId",
          h.customer_name AS "customerName",
          h.branch_id AS "branchId",
          h.branch_name AS "branchName",
          h.public_token AS "publicToken"
        FROM mv_sales_history h
        WHERE ${whereSql.join(" AND ")}
        ORDER BY ${orderByMV}
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
      `;
      const rows = await pool.query(listQuery, listParams);

      return {
        data: (rows.rows || []).map((row: any) => ({
          id: Number(row.id),
          number: String(row.number || row.id),
          createdAt: row.createdAt,
          customer: row.customerId ? { id: Number(row.customerId), name: row.customerName ?? null, dni: null, phone: null } : (row.customerName ? { name: row.customerName, dni: null, phone: null } : null),
          paymentMethod: row.paymentMethod,
          currency: row.currency || "ARS",
          subtotal: String(row.total ?? "0"),
          discount: "0",
          surcharge: "0",
          total: String(row.total ?? "0"),
          branch: row.branchId ? { id: Number(row.branchId), name: row.branchName ?? null } : null,
          publicToken: row.publicToken || null,
        })),
        meta: { limit: normalizedLimit, offset: normalizedOffset, total: Number(countRows.rows?.[0]?.total || 0) },
        usedMaterializedView: true,
      };
    };

    const fromTables = async () => {
      const conditions = [eq(sales.tenantId, tenantId)] as any[];
      if (filters.branchId !== undefined && filters.branchId !== null) conditions.push(eq(sales.branchId, filters.branchId));
      if (filters.from) conditions.push(gte(sales.saleDatetime, filters.from));
      if (filters.to) conditions.push(sql`${sales.saleDatetime} < ${filters.to}`);

      const numberFilter = String(filters.number || "").trim();
      if (numberFilter) conditions.push(ilike(sales.saleNumber, `%${numberFilter}%`));

      if (filters.customerId && Number.isFinite(Number(filters.customerId))) conditions.push(eq(sales.customerId, Number(filters.customerId)));

      const customerQuery = String(filters.customerQuery || "").trim();
      if (customerQuery.length > 0) {
        const like = `%${customerQuery}%`;
        if (/^\d+$/.test(customerQuery)) {
          conditions.push(or(
            ilike(sales.saleNumber, like),
            sql`CAST(${sales.id} AS TEXT) = ${customerQuery}`,
            ilike(customers.doc, like),
            ilike(customers.phone, like),
            ilike(customers.name, like),
            ilike(sales.notes, like),
          )!);
        } else {
          conditions.push(or(
            ilike(customers.name, like),
            ilike(customers.doc, like),
            ilike(customers.phone, like),
            ilike(sales.notes, like),
          )!);
        }
      }

      const where = and(...conditions);
      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: sales.id,
            number: sales.saleNumber,
            createdAt: sales.saleDatetime,
            paymentMethod: sales.paymentMethod,
            currency: sales.currency,
            total: sales.totalAmount,
            customerId: customers.id,
            customerName: customers.name,
            customerDni: customers.doc,
            customerPhone: customers.phone,
            branchId: branches.id,
            branchName: branches.name,
            publicToken: sales.publicToken,
          })
          .from(sales)
          .leftJoin(customers, and(eq(customers.id, sales.customerId), eq(customers.tenantId, sales.tenantId)))
          .leftJoin(branches, and(eq(branches.id, sales.branchId), eq(branches.tenantId, sales.tenantId)))
          .where(where)
          .orderBy(orderByTables)
          .limit(normalizedLimit)
          .offset(normalizedOffset),
        db.select({ total: sql<number>`count(*)::int` }).from(sales).leftJoin(customers, and(eq(customers.id, sales.customerId), eq(customers.tenantId, sales.tenantId))).where(where),
      ]);

      return {
        data: rows.map((row) => ({
          id: Number(row.id),
          number: String(row.number || row.id),
          createdAt: row.createdAt,
          customer: row.customerId
            ? { id: Number(row.customerId), name: row.customerName ?? null, dni: row.customerDni ?? null, phone: row.customerPhone ?? null }
            : null,
          paymentMethod: row.paymentMethod,
          currency: row.currency || "ARS",
          subtotal: String(row.total ?? "0"),
          discount: "0",
          surcharge: "0",
          total: String(row.total ?? "0"),
          branch: row.branchId ? { id: Number(row.branchId), name: row.branchName ?? null } : null,
          publicToken: row.publicToken || null,
        })),
        meta: { limit: normalizedLimit, offset: normalizedOffset, total: Number(totalRows[0]?.total || 0) },
        usedMaterializedView: false,
      };
    };

    try {
      return await tryFromMV();
    } catch (err: any) {
      const message = String(err?.message || "");
      if (err?.code === "42P01" || /does not exist|relation .* does not exist/i.test(message)) {
        return await fromTables();
      }
      try {
        return await fromTables();
      } catch (fallbackErr: any) {
        const fallbackMessage = String(fallbackErr?.message || "");
        if (fallbackErr?.code === "42P01" || /does not exist|relation .* does not exist/i.test(fallbackMessage)) {
          throw Object.assign(new Error("Faltan migraciones de ventas, ejecutar migrations/*.sql"), {
            code: "MIGRATION_MISSING",
          });
        }
        throw fallbackErr;
      }
    }
  },

  async getSaleById(id: number, tenantId: number) {
    const [sale] = await db.select().from(sales).where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)));
    return sale;
  },

  async getSaleItems(id: number, tenantId: number) {
    return db.select().from(saleItems).where(and(eq(saleItems.saleId, id), eq(saleItems.tenantId, tenantId)));
  },
};
