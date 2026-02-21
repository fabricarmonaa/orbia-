import { IStorage } from './interface';
import { planStorage } from './plans';
import { tenantStorage } from './tenants';
import { userStorage } from './users';
import { configStorage } from './config';
import { branchStorage } from './branches';
import { orderStorage } from './orders';
import { cashStorage } from './cash';
import { productStorage } from './products';
import { deliveryStorage } from './delivery';
import { stockStorage } from './stock';
import { sttStorage } from './stt';
import { trackingStorage } from './tracking';
import { auditStorage } from './audit';
import { permissionStorage } from './permissions';
import { expenseStorage } from './expenses';
import { brandingStorage } from './branding';
import { pdfSettingsStorage } from './pdf-settings';
import { salesStorage } from './sales';
import { cashierStorage } from './cashiers';



export class DatabaseStorage implements IStorage {
  getPlans = planStorage.getPlans;
  getPlanById = planStorage.getPlanById;
  createPlan = planStorage.createPlan;
  updatePlanByCode = planStorage.updatePlanByCode;
  listSubscriptions = planStorage.listSubscriptions;
  updateSubscription = planStorage.updateSubscription;
  getSystemSetting = planStorage.getSystemSetting;
  upsertSystemSetting = planStorage.upsertSystemSetting;

  getTenants = tenantStorage.getTenants;
  getTenantById = tenantStorage.getTenantById;
  getTenantByCode = tenantStorage.getTenantByCode;
  createTenant = tenantStorage.createTenant;
  updateTenantPlan = tenantStorage.updateTenantPlan;
  updateTenantSubscription = tenantStorage.updateTenantSubscription;
  updateTenantActive = tenantStorage.updateTenantActive;
  updateTenantBlocked = tenantStorage.updateTenantBlocked;
  updateTenantName = tenantStorage.updateTenantName;
  softDeleteTenant = tenantStorage.softDeleteTenant;
  getTenantAddon = tenantStorage.getTenantAddon;
  getTenantAddons = tenantStorage.getTenantAddons;
  upsertTenantAddon = tenantStorage.upsertTenantAddon;
  getTenantBranding = brandingStorage.getTenantBranding;
  upsertTenantBranding = brandingStorage.upsertTenantBranding;
  getAppBranding = brandingStorage.getAppBranding;
  updateAppBranding = brandingStorage.updateAppBranding;
  getTenantPdfSettings = pdfSettingsStorage.getTenantPdfSettings;
  upsertTenantPdfSettings = pdfSettingsStorage.upsertTenantPdfSettings;
  resetTenantPdfSettings = pdfSettingsStorage.resetTenantPdfSettings;

  getUserById = userStorage.getUserById;
  getUserByEmail = userStorage.getUserByEmail;
  getSuperAdminByEmail = userStorage.getSuperAdminByEmail;
  createUser = userStorage.createUser;
  getTenantAdmins = userStorage.getTenantAdmins;
  getPrimaryTenantAdmin = userStorage.getPrimaryTenantAdmin;
  getUsersByIds = userStorage.getUsersByIds;
  softDeleteUser = userStorage.softDeleteUser;
  getBranchUsers = userStorage.getBranchUsers;
  updateUser = userStorage.updateUser;

  getConfig = configStorage.getConfig;
  upsertConfig = configStorage.upsertConfig;
  getSuperAdminConfig = configStorage.getSuperAdminConfig;
  upsertSuperAdminConfig = configStorage.upsertSuperAdminConfig;

  getBranches = branchStorage.getBranches;
  countBranchesByTenant = branchStorage.countBranchesByTenant;
  createBranch = branchStorage.createBranch;
  getBranchById = branchStorage.getBranchById;
  softDeleteBranch = branchStorage.softDeleteBranch;

  getOrderStatuses = orderStorage.getOrderStatuses;
  getOrderStatusById = orderStorage.getOrderStatusById;
  createOrderStatus = orderStorage.createOrderStatus;
  getOrders = orderStorage.getOrders;
  getOrderById = orderStorage.getOrderById;
  getOrderByTrackingId = orderStorage.getOrderByTrackingId;
  createOrder = orderStorage.createOrder;
  updateOrderStatus = orderStorage.updateOrderStatus;
  updateOrderTracking = orderStorage.updateOrderTracking;
  linkOrderSale = orderStorage.linkOrderSale;
  getNextOrderNumber = orderStorage.getNextOrderNumber;
  countOrders = orderStorage.countOrders;
  getOrderHistory = orderStorage.getOrderHistory;
  createOrderHistory = orderStorage.createOrderHistory;
  getOrderComments = orderStorage.getOrderComments;
  getPublicOrderComments = orderStorage.getPublicOrderComments;
  createOrderComment = orderStorage.createOrderComment;
  getOrdersByBranch = orderStorage.getOrdersByBranch;

  getCashSessions = cashStorage.getCashSessions;
  getOpenSession = cashStorage.getOpenSession;
  createCashSession = cashStorage.createCashSession;
  closeCashSession = cashStorage.closeCashSession;
  getCashMovements = cashStorage.getCashMovements;
  createCashMovement = cashStorage.createCashMovement;
  getMonthlyIncome = cashStorage.getMonthlyIncome;
  getMonthlyExpenses = cashStorage.getMonthlyExpenses;
  getTodayIncome = cashStorage.getTodayIncome;
  getTodayExpenses = cashStorage.getTodayExpenses;
  getExpensesBreakdown = cashStorage.getExpensesBreakdown;
  getCashSessionsByBranch = cashStorage.getCashSessionsByBranch;
  getCashMovementsByBranch = cashStorage.getCashMovementsByBranch;
  getTenantMonthlySummary = cashStorage.getTenantMonthlySummary;
  upsertTenantMonthlySummary = cashStorage.upsertTenantMonthlySummary;

  getProductCategories = productStorage.getProductCategories;
  createProductCategory = productStorage.createProductCategory;
  getProducts = productStorage.getProducts;
  getProductById = productStorage.getProductById;
  createProduct = productStorage.createProduct;
  updateProduct = productStorage.updateProduct;
  toggleProductActive = productStorage.toggleProductActive;
  countProducts = productStorage.countProducts;
  createSaleAtomic = salesStorage.createSaleAtomic;
  listSales = salesStorage.listSales;
  getSaleById = salesStorage.getSaleById;
  getSaleItems = salesStorage.getSaleItems;
  getCashierById = cashierStorage.getCashierById;
  getCashiers = cashierStorage.getCashiers;
  getActiveCashiers = cashierStorage.getActiveCashiers;
  createCashier = cashierStorage.createCashier;
  updateCashier = cashierStorage.updateCashier;
  deactivateCashier = cashierStorage.deactivateCashier;

  createSttLog = sttStorage.createSttLog;
  getSttLogs = sttStorage.getSttLogs;
  updateSttLogConfirmed = sttStorage.updateSttLogConfirmed;
  getLastUnconfirmedLog = sttStorage.getLastUnconfirmedLog;

  getDeliveryAgents = deliveryStorage.getDeliveryAgents;
  getDeliveryAgentById = deliveryStorage.getDeliveryAgentById;
  getDeliveryAgentByDni = deliveryStorage.getDeliveryAgentByDni;
  createDeliveryAgent = deliveryStorage.createDeliveryAgent;
  updateDeliveryAgent = deliveryStorage.updateDeliveryAgent;
  toggleDeliveryAgentActive = deliveryStorage.toggleDeliveryAgentActive;
  getDeliveryActionStates = deliveryStorage.getDeliveryActionStates;
  createDeliveryActionState = deliveryStorage.createDeliveryActionState;
  updateDeliveryActionState = deliveryStorage.updateDeliveryActionState;
  deleteDeliveryActionState = deliveryStorage.deleteDeliveryActionState;
  getDeliveryRoutes = deliveryStorage.getDeliveryRoutes;
  getDeliveryRoutesByAgent = deliveryStorage.getDeliveryRoutesByAgent;
  getActiveRouteByAgent = deliveryStorage.getActiveRouteByAgent;
  getDeliveryRouteById = deliveryStorage.getDeliveryRouteById;
  createDeliveryRoute = deliveryStorage.createDeliveryRoute;
  completeDeliveryRoute = deliveryStorage.completeDeliveryRoute;
  getRouteStops = deliveryStorage.getRouteStops;
  createRouteStop = deliveryStorage.createRouteStop;
  updateRouteStopAction = deliveryStorage.updateRouteStopAction;
  getDeliveryProofsByOrder = deliveryStorage.getDeliveryProofsByOrder;
  createDeliveryProof = deliveryStorage.createDeliveryProof;
  updateDeliveryRouteDirections = deliveryStorage.updateDeliveryRouteDirections;
  getDeliveryOrders = deliveryStorage.getDeliveryOrders;
  updateOrderDeliveryStatus = deliveryStorage.updateOrderDeliveryStatus;
  assignDeliveryAgent = deliveryStorage.assignDeliveryAgent;

  getProductStockByBranch = stockStorage.getProductStockByBranch;
  getStockSummaryByTenant = stockStorage.getStockSummaryByTenant;
  upsertProductStockByBranch = stockStorage.upsertProductStockByBranch;
  getStockMovements = stockStorage.getStockMovements;
  createStockMovement = stockStorage.createStockMovement;
  getBranchStockCount = stockStorage.getBranchStockCount;

  purgeExpiredTracking = trackingStorage.purgeExpiredTracking;

  // Audit
  createAuditLog = auditStorage.createAuditLog;
  getAuditLogs = auditStorage.getAuditLogs;
  getAuditLogsByEntity = auditStorage.getAuditLogsByEntity;

  // Permissions
  getPermissionByKey = permissionStorage.getPermissionByKey;
  createPermission = permissionStorage.createPermission;
  userHasPermission = permissionStorage.userHasPermission;
  grantPermission = permissionStorage.grantPermission;
  revokePermission = permissionStorage.revokePermission;
  getUserPermissions = permissionStorage.getUserPermissions;

  // Expense Categories
  getExpenseCategories = expenseStorage.getExpenseCategories;
  getExpenseCategoryById = expenseStorage.getExpenseCategoryById;
  createExpenseCategory = expenseStorage.createExpenseCategory;
  updateExpenseCategory = expenseStorage.updateExpenseCategory;
  deleteExpenseCategory = expenseStorage.deleteExpenseCategory;

  // Expense Definitions
  listExpenseDefinitions = expenseStorage.listExpenseDefinitions;
  getExpenseDefinitionById = expenseStorage.getExpenseDefinitionById;
  createExpenseDefinition = expenseStorage.createExpenseDefinition;
  updateExpenseDefinition = expenseStorage.updateExpenseDefinition;
  deleteExpenseDefinition = expenseStorage.deleteExpenseDefinition;

  // Fixed Expenses
  getFixedExpenses = expenseStorage.getFixedExpenses;
  getFixedExpenseById = expenseStorage.getFixedExpenseById;
  createFixedExpense = expenseStorage.createFixedExpense;
  updateFixedExpense = expenseStorage.updateFixedExpense;
  toggleFixedExpenseActive = expenseStorage.toggleFixedExpenseActive;
}

export const storage = new DatabaseStorage();
export type { IStorage } from './interface';
