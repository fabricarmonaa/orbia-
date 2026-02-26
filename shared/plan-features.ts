/**
 * Canonical feature and limit keys for Orbia plan gating.
 * These keys are stored in plans.featuresJson and plans.limitsJson (JSONB).
 * Both frontend (plan.ts) and backend (auth.ts:requireFeature) read from these.
 */

// ─────────────────────────────────────────────
// Feature keys (boolean in featuresJson)
// ─────────────────────────────────────────────
export const FEATURES = {
    ORDERS: "orders",
    TRACKING: "tracking",
    CASH_SIMPLE: "cash_simple",
    CASH_SESSIONS: "cash_sessions",
    PRODUCTS: "products",
    BRANCHES: "branches",
    FIXED_EXPENSES: "fixed_expenses",
    VARIABLE_EXPENSES: "variable_expenses",
    REPORTS_ADVANCED: "reports_advanced",
    STT: "stt",
    POS: "pos",
    PURCHASES: "purchases",
    CASHIERS: "cashiers",
    SALES_HISTORY: "sales_history",
    CUSTOMERS: "customers",
    AI: "ai",
    ATTACHMENTS: "attachments",
    PRODUCTS_EXPORT: "products_export",
    TRACKING_CUSTOM_DESIGN: "tracking_custom_design",
    TRACKING_EXTERNAL_LINKS: "tracking_external_links",
    PDF_WATERMARK: "pdf_watermark",
    MARGIN_PRICING: "margin_pricing",
    EXCEL_IMPORT: "excel_import",
    CUSTOM_TOS: "custom_tos",
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

// ─────────────────────────────────────────────
// Limit keys (number in limitsJson; -1 = unlimited)
// ─────────────────────────────────────────────
export const LIMITS = {
    CUSTOMERS_MAX: "customers_max",
    BRANCHES_MAX: "branches_max",
    CASHIERS_MAX: "cashiers_max",
    STAFF_MAX: "staff_max",
    ORDERS_MONTH_MAX: "orders_month_max",
    TRACKING_RETENTION_MIN_HOURS: "tracking_retention_min_hours",
    TRACKING_RETENTION_MAX_HOURS: "tracking_retention_max_hours",
} as const;

export type LimitKey = typeof LIMITS[keyof typeof LIMITS];

// ─────────────────────────────────────────────
// Plan defaults per plan code
// ─────────────────────────────────────────────
export const PLAN_DEFAULTS: Record<string, {
    features: Record<FeatureKey, boolean>;
    limits: Record<LimitKey, number>;
}> = {
    ECONOMICO: {
        features: {
            orders: true,
            tracking: true,
            cash_simple: true,
            cash_sessions: false,
            products: true,
            branches: false,
            fixed_expenses: false,
            variable_expenses: false,
            reports_advanced: false,
            stt: false,
            pos: false,
            purchases: false,
            cashiers: false,
            sales_history: false,
            customers: true,
            ai: false,
            attachments: false,
            products_export: false,
            tracking_custom_design: false,
            tracking_external_links: false,
            pdf_watermark: true,
            margin_pricing: false,
            excel_import: false,
            custom_tos: false,
        },
        limits: {
            customers_max: 50,
            branches_max: 0,
            cashiers_max: 0,
            staff_max: 0,
            orders_month_max: -1,
            tracking_retention_min_hours: 12,
            tracking_retention_max_hours: 24,
        },
    },
    PROFESIONAL: {
        features: {
            orders: true,
            tracking: true,
            cash_simple: true,
            cash_sessions: true,
            products: true,
            branches: true,
            fixed_expenses: true,
            variable_expenses: true,
            reports_advanced: false,
            stt: false,
            pos: true,
            purchases: true,
            cashiers: true,
            sales_history: true,
            customers: true,
            ai: false,
            attachments: true,
            products_export: true,
            tracking_custom_design: false,
            tracking_external_links: false,
            pdf_watermark: false,
            margin_pricing: true,
            excel_import: true,
            custom_tos: false,
        },
        limits: {
            customers_max: 1000,
            branches_max: 1,
            cashiers_max: 2,
            staff_max: 10,
            orders_month_max: -1,
            tracking_retention_min_hours: 1,
            tracking_retention_max_hours: 168,
        },
    },
    ESCALA: {
        features: {
            orders: true,
            tracking: true,
            cash_simple: true,
            cash_sessions: true,
            products: true,
            branches: true,
            fixed_expenses: true,
            variable_expenses: true,
            reports_advanced: true,
            stt: true,
            pos: true,
            purchases: true,
            cashiers: true,
            sales_history: true,
            customers: true,
            ai: true,
            attachments: true,
            products_export: true,
            tracking_custom_design: true,
            tracking_external_links: true,
            pdf_watermark: false,
            margin_pricing: true,
            excel_import: true,
            custom_tos: true,
        },
        limits: {
            customers_max: 5000,
            branches_max: 5,
            cashiers_max: 20,
            staff_max: 50,
            orders_month_max: -1,
            tracking_retention_min_hours: 1,
            tracking_retention_max_hours: 720,
        },
    },
};
