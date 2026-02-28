import type {
  Plan, InsertPlan,
  Tenant, InsertTenant,
  User, InsertUser,
  TenantConfig, InsertTenantConfig,
  Branch, InsertBranch,
  OrderStatus, InsertOrderStatus,
  Order, InsertOrder,
  InsertOrderStatusHistory,
  OrderComment, InsertOrderComment,
  CashSession, InsertCashSession,
  CashMovement, InsertCashMovement,
  ExpenseCategory, InsertExpenseCategory,
  FixedExpense, InsertFixedExpense,
  ExpenseDefinition, InsertExpenseDefinition,
  ProductCategory, InsertProductCategory,
  Product, InsertProduct,
  SttLog, InsertSttLog, SttInteraction, InsertSttInteraction,
  TenantAddon, InsertTenantAddon,
  DeliveryAgent, InsertDeliveryAgent,
  DeliveryActionState, InsertDeliveryActionState,
  DeliveryRoute, InsertDeliveryRoute,
  DeliveryRouteStop, InsertDeliveryRouteStop,
  DeliveryProof, InsertDeliveryProof,
  SuperAdminConfig, InsertSuperAdminConfig,
  ProductStockByBranch, InsertProductStockByBranch,
  StockMovement, InsertStockMovement,
  TenantBranding, InsertTenantBranding,
  AppBranding, InsertAppBranding,
  TenantPdfSettings, InsertTenantPdfSettings,
  TenantMonthlySummary, InsertTenantMonthlySummary,
  Sale, InsertSale, SaleItem,
  Cashier, InsertCashier,
  TenantSubscription, InsertTenantSubscription,
  SystemSetting,
} from "@shared/schema";

export interface IStorage {
  getPlans(): Promise<Plan[]>;
  getPlanById(id: number): Promise<Plan | undefined>;
  createPlan(data: InsertPlan): Promise<Plan>;
  updatePlanByCode(planCode: string, data: Partial<InsertPlan>): Promise<Plan | undefined>;
  listSubscriptions(): Promise<Array<{ tenantId: number; tenantName: string; tenantCode: string; planCode: string | null; status: string | null; startsAt: Date | null; expiresAt: Date | null }>>;
  updateSubscription(tenantId: number, data: { planCode: string; status: string; startsAt?: Date | null; expiresAt?: Date | null }): Promise<TenantSubscription>;
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  upsertSystemSetting(key: string, value: string): Promise<SystemSetting>;

  getTenants(): Promise<Tenant[]>;
  getTenantById(id: number): Promise<Tenant | undefined>;
  getTenantByCode(code: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;
  updateTenantPlan(tenantId: number, planId: number): Promise<void>;

  getUserById(id: number, tenantId: number): Promise<User | undefined>;
  getUserByEmail(email: string, tenantId?: number | null): Promise<User | undefined>;
  getSuperAdminByEmail(email: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  getTenantAdmins(tenantId: number): Promise<User[]>;
  getPrimaryTenantAdmin(tenantId: number): Promise<User | undefined>;
  getUsersByIds(tenantId: number, userIds: number[]): Promise<User[]>;
  softDeleteUser(id: number, tenantId: number): Promise<User | undefined>;
  getBranchUsers(tenantId: number, branchId?: number): Promise<User[]>;
  updateUser(id: number, tenantId: number, data: Partial<InsertUser>): Promise<User>;

  getConfig(tenantId: number): Promise<TenantConfig | undefined>;
  upsertConfig(data: InsertTenantConfig): Promise<TenantConfig>;

  getBranches(tenantId: number): Promise<Branch[]>;
  countBranchesByTenant(tenantId: number): Promise<number>;
  createBranch(data: InsertBranch): Promise<Branch>;
  softDeleteBranch(id: number, tenantId: number): Promise<Branch | undefined>;

  getOrderStatuses(tenantId: number): Promise<OrderStatus[]>;
  getOrderStatusById(id: number, tenantId: number): Promise<OrderStatus | undefined>;
  createOrderStatus(data: InsertOrderStatus): Promise<OrderStatus>;

  getOrders(tenantId: number): Promise<Order[]>;
  getOrderById(id: number, tenantId: number): Promise<Order | undefined>;
  getOrderByTrackingId(trackingId: string): Promise<Order | undefined>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrderStatus(id: number, tenantId: number, statusId: number): Promise<void>;
  updateOrderTracking(id: number, tenantId: number, trackingId: string, expiresAt: Date): Promise<void>;
  linkOrderSale(id: number, tenantId: number, saleId: number, salePublicToken: string | null): Promise<void>;
  getNextOrderNumber(tenantId: number): Promise<number>;
  countOrders(tenantId: number, branchId?: number | null): Promise<number>;

  getOrderHistory(orderId: number, tenantId: number): Promise<any[]>;
  createOrderHistory(data: InsertOrderStatusHistory): Promise<void>;

  getOrderComments(orderId: number, tenantId: number): Promise<OrderComment[]>;
  getPublicOrderComments(orderId: number): Promise<OrderComment[]>;
  createOrderComment(data: InsertOrderComment): Promise<OrderComment>;

  getCashSessions(tenantId: number): Promise<CashSession[]>;
  getOpenSession(tenantId: number, branchId?: number | null): Promise<CashSession | undefined>;
  createCashSession(data: InsertCashSession): Promise<CashSession>;
  closeCashSession(id: number, tenantId: number, branchId: number | null, closingAmount: string): Promise<void>;

  getCashMovements(tenantId: number): Promise<CashMovement[]>;
  createCashMovement(data: InsertCashMovement): Promise<CashMovement>;
  getMonthlyIncome(tenantId: number, branchId?: number | null): Promise<number>;
  getMonthlyExpenses(tenantId: number, branchId?: number | null): Promise<number>;
  getMonthlyExpensesByType(tenantId: number, branchId?: number | null): Promise<{ fixed: number; variable: number }>;
  getTodayIncome(tenantId: number, branchId?: number | null): Promise<number>;
  getTodayExpenses(tenantId: number, branchId?: number | null): Promise<number>;
  getExpensesBreakdown(tenantId: number, dateFrom: Date, dateTo: Date): Promise<Record<string, number>>;

  getExpenseCategories(tenantId: number): Promise<ExpenseCategory[]>;
  getExpenseCategoryById(id: number, tenantId: number): Promise<ExpenseCategory | undefined>;
  createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory>;
  updateExpenseCategory(id: number, tenantId: number, data: Partial<InsertExpenseCategory>): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: number, tenantId: number): Promise<void>;

  getFixedExpenses(tenantId: number): Promise<FixedExpense[]>;
  getFixedExpenseById(id: number, tenantId: number): Promise<FixedExpense | undefined>;
  createFixedExpense(data: InsertFixedExpense): Promise<FixedExpense>;
  updateFixedExpense(id: number, tenantId: number, data: Partial<InsertFixedExpense>): Promise<FixedExpense>;
  toggleFixedExpenseActive(id: number, tenantId: number, isActive: boolean): Promise<void>;

  listExpenseDefinitions(tenantId: number, type?: string): Promise<ExpenseDefinition[]>;
  getExpenseDefinitionById(id: number, tenantId: number): Promise<ExpenseDefinition | undefined>;
  createExpenseDefinition(data: InsertExpenseDefinition): Promise<ExpenseDefinition>;
  updateExpenseDefinition(id: number, tenantId: number, data: Partial<InsertExpenseDefinition>): Promise<ExpenseDefinition>;
  deleteExpenseDefinition(id: number, tenantId: number): Promise<void>;

  getProductCategories(tenantId: number): Promise<ProductCategory[]>;
  createProductCategory(data: InsertProductCategory): Promise<ProductCategory>;

  getProducts(tenantId: number): Promise<Product[]>;
  getProductByCode(tenantId: number, code: string): Promise<Product | undefined>;
  getProductById(id: number, tenantId: number): Promise<Product | undefined>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: number, tenantId: number, data: Partial<InsertProduct>): Promise<Product>;
  toggleProductActive(id: number, tenantId: number, isActive: boolean): Promise<void>;
  countProducts(tenantId: number): Promise<number>;

  createSaleAtomic(data: {
    tenantId: number;
    branchId: number | null;
    cashierUserId: number;
    currency: string;
    paymentMethod: string;
    notes: string | null;
    customerId?: number | null;
    hasBranchesFeature?: boolean;
    discountType: "NONE" | "PERCENT" | "FIXED";
    discountValue: number;
    surchargeType: "NONE" | "PERCENT" | "FIXED";
    surchargeValue: number;
    items: Array<{ productId: number; quantity: number; unitPrice?: number | null }>;
  }): Promise<{ sale: Sale }>;
  listSales(tenantId: number, filters: { branchId?: number | null; from?: Date; to?: Date; number?: string; customerId?: number; customerQuery?: string; limit: number; offset: number; sort?: "date_desc" | "date_asc" }): Promise<{ data: Array<{ id: number; number: string; createdAt: Date; customer: { id?: number; name?: string | null; dni?: string | null; phone?: string | null } | null; paymentMethod: string; subtotal: string; discount: string; surcharge: string; total: string; branch: { id?: number | null; name?: string | null } | null }>; meta: { limit: number; offset: number; total: number }; usedMaterializedView: boolean }>;
  getSaleById(id: number, tenantId: number): Promise<Sale | undefined>;
  getSaleItems(id: number, tenantId: number): Promise<SaleItem[]>;

  getCashierById(id: number, tenantId: number): Promise<Cashier | undefined>;
  getCashiers(tenantId: number): Promise<Cashier[]>;
  getActiveCashiers(tenantId: number): Promise<Cashier[]>;
  createCashier(data: InsertCashier): Promise<Cashier>;
  updateCashier(id: number, tenantId: number, data: Partial<InsertCashier>): Promise<Cashier | undefined>;
  deactivateCashier(id: number, tenantId: number): Promise<Cashier | undefined>;

  createSttLog(data: InsertSttLog): Promise<SttLog>;
  getSttLogs(tenantId: number): Promise<SttLog[]>;
  updateSttLogConfirmed(logId: number, tenantId: number, updates: { resultEntityType: string; resultEntityId: number }): Promise<void>;
  getLastUnconfirmedLog(tenantId: number, userId: number, context: string): Promise<SttLog | undefined>;
  createSttInteraction(data: InsertSttInteraction): Promise<SttInteraction>;
  getSttInteractionsByTenant(tenantId: number, userId?: number | null, limit?: number): Promise<SttInteraction[]>;

  getOrdersByBranch(tenantId: number, branchId: number): Promise<Order[]>;
  getCashSessionsByBranch(tenantId: number, branchId: number): Promise<CashSession[]>;
  getCashMovementsByBranch(tenantId: number, branchId: number): Promise<CashMovement[]>;
  getBranchById(id: number, tenantId: number): Promise<Branch | undefined>;

  getTenantAddon(tenantId: number, addonKey: string): Promise<TenantAddon | undefined>;
  getTenantAddons(tenantId: number): Promise<TenantAddon[]>;
  upsertTenantAddon(data: InsertTenantAddon): Promise<TenantAddon>;

  getDeliveryAgents(tenantId: number): Promise<DeliveryAgent[]>;
  getDeliveryAgentById(id: number, tenantId: number): Promise<DeliveryAgent | undefined>;
  getDeliveryAgentByDni(dni: string, tenantId: number): Promise<DeliveryAgent | undefined>;
  createDeliveryAgent(data: InsertDeliveryAgent): Promise<DeliveryAgent>;
  updateDeliveryAgent(id: number, tenantId: number, data: Partial<InsertDeliveryAgent>): Promise<DeliveryAgent>;
  toggleDeliveryAgentActive(id: number, tenantId: number, isActive: boolean): Promise<void>;

  getDeliveryActionStates(tenantId: number): Promise<DeliveryActionState[]>;
  createDeliveryActionState(data: InsertDeliveryActionState): Promise<DeliveryActionState>;
  updateDeliveryActionState(id: number, tenantId: number, data: Partial<InsertDeliveryActionState>): Promise<DeliveryActionState>;
  deleteDeliveryActionState(id: number, tenantId: number): Promise<void>;

  getDeliveryRoutes(tenantId: number): Promise<DeliveryRoute[]>;
  getDeliveryRoutesByAgent(agentId: number, tenantId: number): Promise<DeliveryRoute[]>;
  getActiveRouteByAgent(agentId: number, tenantId: number): Promise<DeliveryRoute | undefined>;
  getDeliveryRouteById(id: number, tenantId: number): Promise<DeliveryRoute | undefined>;
  createDeliveryRoute(data: InsertDeliveryRoute): Promise<DeliveryRoute>;
  completeDeliveryRoute(id: number, tenantId: number): Promise<void>;

  getRouteStops(routeId: number): Promise<DeliveryRouteStop[]>;
  createRouteStop(data: InsertDeliveryRouteStop): Promise<DeliveryRouteStop>;
  updateRouteStopAction(id: number, actionStateId: number): Promise<void>;

  getDeliveryProofsByOrder(orderId: number): Promise<DeliveryProof[]>;
  createDeliveryProof(data: InsertDeliveryProof): Promise<DeliveryProof>;

  updateDeliveryRouteDirections(id: number, tenantId: number, directionsUrl: string): Promise<void>;
  getDeliveryOrders(tenantId: number): Promise<Order[]>;
  updateOrderDeliveryStatus(id: number, tenantId: number, status: string): Promise<void>;
  assignDeliveryAgent(orderId: number, tenantId: number, agentId: number): Promise<void>;

  getSuperAdminConfig(userId: number): Promise<SuperAdminConfig | undefined>;
  upsertSuperAdminConfig(data: InsertSuperAdminConfig): Promise<SuperAdminConfig>;

  updateTenantSubscription(tenantId: number, startDate: Date, endDate: Date): Promise<void>;
  updateTenantActive(tenantId: number, isActive: boolean): Promise<void>;
  updateTenantBlocked(tenantId: number, isBlocked: boolean): Promise<void>;
  updateTenantName(tenantId: number, name: string): Promise<void>;
  updateTenantCode(tenantId: number, code: string): Promise<void>;
  softDeleteTenant(tenantId: number): Promise<void>;

  getTenantBranding(tenantId: number): Promise<{
    id: number | null;
    tenantId: number;
    logoUrl: string | null;
    displayName: string;
    colors: Record<string, unknown>;
    texts: Record<string, unknown>;
    links: Record<string, unknown>;
    pdfConfig: Record<string, unknown>;
    updatedAt: Date;
  }>;
  upsertTenantBranding(tenantId: number, payload: Partial<InsertTenantBranding>): Promise<TenantBranding>;
  getAppBranding(): Promise<{
    id: number | null;
    orbiaLogoUrl: string | null;
    orbiaName: string;
    updatedAt: Date;
  }>;
  updateAppBranding(payload: Partial<InsertAppBranding>): Promise<AppBranding>;
  getTenantPdfSettings(tenantId: number): Promise<{
    id: number | null;
    tenantId: number;
    documentType: string;
    templateKey: string;
    pageSize: string;
    orientation: string;
    showLogo: boolean;
    headerText: string | null;
    subheaderText: string | null;
    footerText: string | null;
    showBranchStock: boolean;
    showSku: boolean;
    showDescription: boolean;
    priceColumnLabel: string;
    currencySymbol: string;
    columns: string[];
    invoiceColumns: string[];
    documentTitle: string;
    fiscalName: string | null;
    fiscalCuit: string | null;
    fiscalIibb: string | null;
    fiscalAddress: string | null;
    fiscalCity: string | null;
    showFooterTotals: boolean;
    styles: Record<string, unknown>;
    updatedAt: Date;
  }>;
  upsertTenantPdfSettings(tenantId: number, payload: Partial<InsertTenantPdfSettings>): Promise<TenantPdfSettings>;
  resetTenantPdfSettings(tenantId: number): Promise<{
    id: number | null;
    tenantId: number;
    documentType: string;
    templateKey: string;
    pageSize: string;
    orientation: string;
    showLogo: boolean;
    headerText: string | null;
    subheaderText: string | null;
    footerText: string | null;
    showBranchStock: boolean;
    showSku: boolean;
    showDescription: boolean;
    priceColumnLabel: string;
    currencySymbol: string;
    columns: string[];
    invoiceColumns: string[];
    documentTitle: string;
    fiscalName: string | null;
    fiscalCuit: string | null;
    fiscalIibb: string | null;
    fiscalAddress: string | null;
    fiscalCity: string | null;
    showFooterTotals: boolean;
    styles: Record<string, unknown>;
    updatedAt: Date;
  }>;

  getTenantMonthlySummary(tenantId: number, year: number, month: number): Promise<TenantMonthlySummary | undefined>;
  upsertTenantMonthlySummary(data: InsertTenantMonthlySummary): Promise<TenantMonthlySummary>;

  getProductStockByBranch(productId: number, tenantId: number): Promise<ProductStockByBranch[]>;
  getStockSummaryByTenant(tenantId: number): Promise<Array<{
    productId: number;
    branchId: number;
    stock: number;
    branchName: string;
  }>>;
  upsertProductStockByBranch(data: InsertProductStockByBranch): Promise<ProductStockByBranch>;
  getStockMovements(productId: number, tenantId: number): Promise<StockMovement[]>;
  createStockMovement(data: InsertStockMovement): Promise<StockMovement>;
  getBranchStockCount(tenantId: number, branchId: number): Promise<number>;

  purgeExpiredTracking(): Promise<number>;
}
