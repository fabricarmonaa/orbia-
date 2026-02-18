import type { Express } from "express";
import { storage } from "../storage";
import {
  generateToken,
  comparePassword,
  hashPassword,
  tenantAuth,
  requireAddon,
  deliveryAuth,
} from "../auth";
import { deliveryUpload } from "./uploads";
import { handleSingleUpload } from "../middleware/upload-guards";

export function registerDeliveryRoutes(app: Express) {
  app.post("/api/delivery/auth/login", async (req, res) => {
    try {
      const { tenantCode, dni, pin } = req.body;
      if (!tenantCode || !dni || !pin) {
        return res.status(400).json({ error: "Código de negocio, DNI y PIN requeridos" });
      }
      const tenant = await storage.getTenantByCode(tenantCode);
      if (!tenant || !tenant.isActive) {
        return res.status(401).json({ error: "Negocio no encontrado o inactivo" });
      }
      const addon = await storage.getTenantAddon(tenant.id, "delivery");
      if (!addon?.enabled) {
        return res.status(403).json({ error: "El addon de delivery no está habilitado", code: "ADDON_NOT_ENABLED" });
      }
      const agent = await storage.getDeliveryAgentByDni(dni, tenant.id);
      if (!agent || !agent.isActive) {
        return res.status(401).json({ error: "Delivery no encontrado o inactivo" });
      }
      const validPin = await comparePassword(pin, agent.pinHash);
      if (!validPin) {
        return res.status(401).json({ error: "PIN incorrecto" });
      }
      const token = generateToken({
        userId: agent.id,
        email: "",
        role: "delivery",
        tenantId: tenant.id,
        isSuperAdmin: false,
        branchId: null,
        scope: "DELIVERY",
        deliveryAgentId: agent.id,
      });
      res.json({
        token,
        agent: {
          id: agent.id,
          firstName: agent.firstName,
          lastName: agent.lastName,
          dni: agent.dni,
          tenantId: tenant.id,
        },
        tenantName: tenant.name,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/agents", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const agents = await storage.getDeliveryAgents(req.auth!.tenantId!);
      const safeAgents = agents.map(({ pinHash, ...rest }) => rest);
      res.json({ data: safeAgents });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/delivery/agents", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const { dni, firstName, lastName, phone, pin } = req.body;
      if (!dni || !firstName || !lastName || !phone || !pin) {
        return res.status(400).json({ error: "DNI, nombre, apellido, teléfono y PIN son obligatorios" });
      }
      const existing = await storage.getDeliveryAgentByDni(dni, req.auth!.tenantId!);
      if (existing) {
        return res.status(409).json({ error: "Ya existe un delivery con ese DNI" });
      }
      const pinHash = await hashPassword(pin);
      const agent = await storage.createDeliveryAgent({
        tenantId: req.auth!.tenantId!,
        dni,
        firstName,
        lastName,
        phone,
        pinHash,
        isActive: true,
      });
      const { pinHash: _, ...safeAgent } = agent;
      res.status(201).json({ data: safeAgent });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/delivery/agents/:id", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { firstName, lastName, phone, pin, isActive } = req.body;
      const updates: any = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (phone !== undefined) updates.phone = phone;
      if (pin !== undefined) updates.pinHash = await hashPassword(pin);
      if (isActive !== undefined) updates.isActive = isActive;
      const agent = await storage.updateDeliveryAgent(id, req.auth!.tenantId!, updates);
      if (!agent) return res.status(404).json({ error: "Delivery no encontrado" });
      const { pinHash: _, ...safeAgent } = agent;
      res.json({ data: safeAgent });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/delivery/agents/:id/toggle", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const agent = await storage.getDeliveryAgentById(id, req.auth!.tenantId!);
      if (!agent) return res.status(404).json({ error: "Delivery no encontrado" });
      await storage.toggleDeliveryAgentActive(id, req.auth!.tenantId!, !agent.isActive);
      res.json({ data: { isActive: !agent.isActive } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/action-states", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const states = await storage.getDeliveryActionStates(req.auth!.tenantId!);
      res.json({ data: states });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/delivery/action-states", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const { code, label, requiresPhoto, requiresComment, nextOrderStatusId, sortOrder } = req.body;
      if (!code || !label) return res.status(400).json({ error: "code y label son obligatorios" });
      const state = await storage.createDeliveryActionState({
        tenantId: req.auth!.tenantId!,
        code,
        label,
        requiresPhoto: requiresPhoto ?? true,
        requiresComment: requiresComment ?? false,
        nextOrderStatusId: nextOrderStatusId ?? null,
        sortOrder: sortOrder ?? 0,
      });
      res.status(201).json({ data: state });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/delivery/action-states/:id", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const state = await storage.updateDeliveryActionState(id, req.auth!.tenantId!, req.body);
      res.json({ data: state });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/delivery/action-states/:id", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await storage.deleteDeliveryActionState(id, req.auth!.tenantId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/routes", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const routes = await storage.getDeliveryRoutes(req.auth!.tenantId!);
      const routesWithStops = await Promise.all(
        routes.map(async (route) => {
          const stops = await storage.getRouteStops(route.id);
          return { ...route, stops };
        })
      );
      res.json({ data: routesWithStops });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/orders", tenantAuth, requireAddon("delivery"), async (req, res) => {
    try {
      const deliveryOrders = await storage.getDeliveryOrders(req.auth!.tenantId!);
      res.json({ data: deliveryOrders });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/agent/action-states", deliveryAuth, async (req, res) => {
    try {
      const states = await storage.getDeliveryActionStates(req.auth!.tenantId!);
      res.json({ data: states });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/me", deliveryAuth, async (req, res) => {
    try {
      const agent = await storage.getDeliveryAgentById(req.auth!.deliveryAgentId!, req.auth!.tenantId!);
      if (!agent) return res.status(404).json({ error: "Agente no encontrado" });
      const { pinHash, ...safeAgent } = agent;
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      res.json({ data: safeAgent, tenantName: tenant?.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/orders/available", deliveryAuth, async (req, res) => {
    try {
      const allOrders = await storage.getDeliveryOrders(req.auth!.tenantId!);
      const available = allOrders.filter(
        (o) => !o.assignedAgentId || o.deliveryStatus === "pending"
      );
      const branches_list = await storage.getBranches(req.auth!.tenantId!);
      const enriched = available.map((o) => ({
        ...o,
        branchName: branches_list.find((b) => b.id === o.branchId)?.name || "General",
      }));
      res.json({ data: enriched });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/delivery/routes", deliveryAuth, async (req, res) => {
    try {
      const { orderIds } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "Se requiere al menos un pedido" });
      }
      const existingActive = await storage.getActiveRouteByAgent(req.auth!.deliveryAgentId!, req.auth!.tenantId!);
      if (existingActive) {
        return res.status(409).json({ error: "Ya tenés una ruta activa. Completala antes de crear otra." });
      }
      const config = await storage.getConfig(req.auth!.tenantId!);
      const originAddress = req.body.originAddress || config?.businessName || "Origen";

      const route = await storage.createDeliveryRoute({
        tenantId: req.auth!.tenantId!,
        agentId: req.auth!.deliveryAgentId!,
        status: "active",
        originAddress,
      });

      const orderAddresses: string[] = [];
      for (let i = 0; i < orderIds.length; i++) {
        await storage.createRouteStop({
          routeId: route.id,
          orderId: orderIds[i],
          stopOrder: i + 1,
        });
        await storage.assignDeliveryAgent(orderIds[i], req.auth!.tenantId!, req.auth!.deliveryAgentId!);
        const order = await storage.getOrderById(orderIds[i], req.auth!.tenantId!);
        if (order?.deliveryAddress) {
          const addr = [order.deliveryAddress, order.deliveryCity].filter(Boolean).join(", ");
          orderAddresses.push(addr);
        }
      }

      let directionsUrl: string | null = null;
      if (orderAddresses.length > 0) {
        const origin = encodeURIComponent(originAddress);
        const destination = encodeURIComponent(orderAddresses[orderAddresses.length - 1]);
        const waypoints = orderAddresses.slice(0, -1).map(a => encodeURIComponent(a)).join("|");
        directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
        if (waypoints) {
          directionsUrl += `&waypoints=${waypoints}`;
        }
        await storage.updateDeliveryRouteDirections(route.id, req.auth!.tenantId!, directionsUrl);
      }

      const stops = await storage.getRouteStops(route.id);
      res.status(201).json({ data: { ...route, directionsUrl, stops } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/routes/active", deliveryAuth, async (req, res) => {
    try {
      const route = await storage.getActiveRouteByAgent(req.auth!.deliveryAgentId!, req.auth!.tenantId!);
      if (!route) return res.json({ data: null });
      const stops = await storage.getRouteStops(route.id);
      const enrichedStops = await Promise.all(
        stops.map(async (stop) => {
          const order = await storage.getOrderById(stop.orderId, req.auth!.tenantId!);
          return { ...stop, order };
        })
      );
      res.json({ data: { ...route, stops: enrichedStops } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/routes/history", deliveryAuth, async (req, res) => {
    try {
      const routes = await storage.getDeliveryRoutesByAgent(req.auth!.deliveryAgentId!, req.auth!.tenantId!);
      const completed = routes.filter((r) => r.status === "completed");
      res.json({ data: completed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/delivery/routes/:routeId", deliveryAuth, async (req, res) => {
    try {
      const routeId = parseInt(req.params.routeId as string);
      const route = await storage.getDeliveryRouteById(routeId, req.auth!.tenantId!);
      if (!route) return res.status(404).json({ error: "Ruta no encontrada" });
      if (route.agentId !== req.auth!.deliveryAgentId) {
        return res.status(403).json({ error: "No tenés acceso a esta ruta" });
      }
      const stops = await storage.getRouteStops(route.id);
      const enrichedStops = await Promise.all(
        stops.map(async (stop) => {
          const order = await storage.getOrderById(stop.orderId, req.auth!.tenantId!);
          return { ...stop, order };
        })
      );
      res.json({ data: { ...route, stops: enrichedStops } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/delivery/routes/:routeId/stops/:stopId/action",
    deliveryAuth,
    handleSingleUpload(deliveryUpload, "photo"),
    async (req, res) => {
      try {
        const routeId = parseInt(req.params.routeId as string);
        const stopId = parseInt(req.params.stopId as string);
        const { actionCode, notes } = req.body;

        if (!actionCode) return res.status(400).json({ error: "actionCode requerido" });

        const route = await storage.getDeliveryRouteById(routeId, req.auth!.tenantId!);
        if (!route || route.agentId !== req.auth!.deliveryAgentId) {
          return res.status(403).json({ error: "Sin acceso a esta ruta" });
        }

        const stops = await storage.getRouteStops(routeId);
        const stop = stops.find((s) => s.id === stopId);
        if (!stop) return res.status(404).json({ error: "Parada no encontrada" });

        const actionStates = await storage.getDeliveryActionStates(req.auth!.tenantId!);
        const actionState = actionStates.find((s) => s.code === actionCode);
        if (!actionState) return res.status(400).json({ error: "Estado de acción inválido" });

        if (actionState.requiresPhoto && !req.file) {
          return res.status(400).json({ error: "Esta acción requiere una foto" });
        }

        await storage.updateRouteStopAction(stopId, actionState.id);

        const photoUrl = req.file
          ? `/uploads/delivery/${req.file.filename}?v=${new Date().getTime()}`
          : null;
        const proof = await storage.createDeliveryProof({
          tenantId: req.auth!.tenantId!,
          routeId,
          stopId,
          orderId: stop.orderId,
          actionCode,
          photoUrl,
          notes: notes || null,
          deliveredById: req.auth!.deliveryAgentId!,
        });

        await storage.updateOrderDeliveryStatus(stop.orderId, req.auth!.tenantId!, actionCode.toLowerCase());

        if (actionState.nextOrderStatusId) {
          await storage.updateOrderStatus(stop.orderId, req.auth!.tenantId!, actionState.nextOrderStatusId);
        }

        res.json({ data: proof });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post("/api/delivery/routes/:routeId/complete", deliveryAuth, async (req, res) => {
    try {
      const routeId = parseInt(req.params.routeId as string);
      const route = await storage.getDeliveryRouteById(routeId, req.auth!.tenantId!);
      if (!route || route.agentId !== req.auth!.deliveryAgentId) {
        return res.status(403).json({ error: "Sin acceso a esta ruta" });
      }
      const stops = await storage.getRouteStops(routeId);
      const pending = stops.filter((s) => !s.actionStateId);
      if (pending.length > 0) {
        return res.status(400).json({
          error: `Hay ${pending.length} parada(s) sin acción. Completá todas antes de finalizar.`,
        });
      }
      await storage.completeDeliveryRoute(routeId, req.auth!.tenantId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
