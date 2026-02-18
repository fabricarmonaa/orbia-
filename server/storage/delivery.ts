import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  deliveryAgents, deliveryActionStates, deliveryRoutes, deliveryRouteStops, deliveryProofs, orders,
  type InsertDeliveryAgent, type InsertDeliveryActionState, type InsertDeliveryRoute,
  type InsertDeliveryRouteStop, type InsertDeliveryProof,
} from "@shared/schema";

export const deliveryStorage = {
  async getDeliveryAgents(tenantId: number) {
    return db.select().from(deliveryAgents).where(eq(deliveryAgents.tenantId, tenantId)).orderBy(desc(deliveryAgents.createdAt));
  },
  async getDeliveryAgentById(id: number, tenantId: number) {
    const [agent] = await db
      .select()
      .from(deliveryAgents)
      .where(and(eq(deliveryAgents.id, id), eq(deliveryAgents.tenantId, tenantId)));
    return agent;
  },
  async getDeliveryAgentByDni(dni: string, tenantId: number) {
    const [agent] = await db
      .select()
      .from(deliveryAgents)
      .where(and(eq(deliveryAgents.dni, dni), eq(deliveryAgents.tenantId, tenantId)));
    return agent;
  },
  async createDeliveryAgent(data: InsertDeliveryAgent) {
    const [agent] = await db.insert(deliveryAgents).values(data).returning();
    return agent;
  },
  async updateDeliveryAgent(id: number, tenantId: number, data: Partial<InsertDeliveryAgent>) {
    const [agent] = await db
      .update(deliveryAgents)
      .set(data)
      .where(and(eq(deliveryAgents.id, id), eq(deliveryAgents.tenantId, tenantId)))
      .returning();
    return agent;
  },
  async toggleDeliveryAgentActive(id: number, tenantId: number, isActive: boolean) {
    await db
      .update(deliveryAgents)
      .set({ isActive })
      .where(and(eq(deliveryAgents.id, id), eq(deliveryAgents.tenantId, tenantId)));
  },
  async getDeliveryActionStates(tenantId: number) {
    return db
      .select()
      .from(deliveryActionStates)
      .where(eq(deliveryActionStates.tenantId, tenantId))
      .orderBy(deliveryActionStates.sortOrder);
  },
  async createDeliveryActionState(data: InsertDeliveryActionState) {
    const [state] = await db.insert(deliveryActionStates).values(data).returning();
    return state;
  },
  async updateDeliveryActionState(id: number, tenantId: number, data: Partial<InsertDeliveryActionState>) {
    const [state] = await db
      .update(deliveryActionStates)
      .set(data)
      .where(and(eq(deliveryActionStates.id, id), eq(deliveryActionStates.tenantId, tenantId)))
      .returning();
    return state;
  },
  async deleteDeliveryActionState(id: number, tenantId: number) {
    await db
      .delete(deliveryActionStates)
      .where(and(eq(deliveryActionStates.id, id), eq(deliveryActionStates.tenantId, tenantId)));
  },
  async getDeliveryRoutes(tenantId: number) {
    return db
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.tenantId, tenantId))
      .orderBy(desc(deliveryRoutes.startedAt));
  },
  async getDeliveryRoutesByAgent(agentId: number, tenantId: number) {
    return db
      .select()
      .from(deliveryRoutes)
      .where(and(eq(deliveryRoutes.agentId, agentId), eq(deliveryRoutes.tenantId, tenantId)))
      .orderBy(desc(deliveryRoutes.startedAt));
  },
  async getActiveRouteByAgent(agentId: number, tenantId: number) {
    const [route] = await db
      .select()
      .from(deliveryRoutes)
      .where(and(
        eq(deliveryRoutes.agentId, agentId),
        eq(deliveryRoutes.tenantId, tenantId),
        eq(deliveryRoutes.status, "active")
      ));
    return route;
  },
  async getDeliveryRouteById(id: number, tenantId: number) {
    const [route] = await db
      .select()
      .from(deliveryRoutes)
      .where(and(eq(deliveryRoutes.id, id), eq(deliveryRoutes.tenantId, tenantId)));
    return route;
  },
  async createDeliveryRoute(data: InsertDeliveryRoute) {
    const [route] = await db.insert(deliveryRoutes).values(data).returning();
    return route;
  },
  async completeDeliveryRoute(id: number, tenantId: number) {
    await db
      .update(deliveryRoutes)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(deliveryRoutes.id, id), eq(deliveryRoutes.tenantId, tenantId)));
  },
  async getRouteStops(routeId: number) {
    return db
      .select()
      .from(deliveryRouteStops)
      .where(eq(deliveryRouteStops.routeId, routeId))
      .orderBy(deliveryRouteStops.stopOrder);
  },
  async createRouteStop(data: InsertDeliveryRouteStop) {
    const [stop] = await db.insert(deliveryRouteStops).values(data).returning();
    return stop;
  },
  async updateRouteStopAction(id: number, actionStateId: number) {
    await db
      .update(deliveryRouteStops)
      .set({ actionStateId, actionAt: new Date() })
      .where(eq(deliveryRouteStops.id, id));
  },
  async getDeliveryProofsByOrder(orderId: number) {
    return db
      .select()
      .from(deliveryProofs)
      .where(eq(deliveryProofs.orderId, orderId))
      .orderBy(desc(deliveryProofs.createdAt));
  },
  async createDeliveryProof(data: InsertDeliveryProof) {
    const [proof] = await db.insert(deliveryProofs).values(data).returning();
    return proof;
  },
  async getDeliveryOrders(tenantId: number) {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.requiresDelivery, true)))
      .orderBy(desc(orders.createdAt));
  },
  async updateOrderDeliveryStatus(id: number, tenantId: number, status: string) {
    await db
      .update(orders)
      .set({ deliveryStatus: status, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
  },
  async updateDeliveryRouteDirections(id: number, tenantId: number, directionsUrl: string) {
    await db
      .update(deliveryRoutes)
      .set({ directionsUrl })
      .where(and(eq(deliveryRoutes.id, id), eq(deliveryRoutes.tenantId, tenantId)));
  },
  async assignDeliveryAgent(orderId: number, tenantId: number, agentId: number) {
    await db
      .update(orders)
      .set({ assignedAgentId: agentId, deliveryStatus: "assigned", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  },
};
