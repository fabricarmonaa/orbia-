export type WhatsAppRealtimeEventType =
  | "conversation.created"
  | "conversation.updated"
  | "conversation.read"
  | "conversation.assigned"
  | "conversation.status_changed"
  | "message.created"
  | "message.status_updated";

export type WhatsAppRealtimeEvent = {
  eventType: WhatsAppRealtimeEventType;
  tenantId: number;
  branchId: number | null;
  conversationId: number;
  messageId?: number;
  changedFields?: string[];
  timestamp: string;
  conversation?: any;
  message?: any;
};

type Subscriber = {
  id: number;
  tenantId: number;
  branchId: number | null;
  onEvent: (event: WhatsAppRealtimeEvent) => void;
};

class WhatsAppRealtimeBus {
  private nextId = 1;
  private subscribers = new Map<number, Subscriber>();

  subscribe(input: Omit<Subscriber, "id">) {
    const id = this.nextId++;
    this.subscribers.set(id, { id, ...input });
    return () => {
      this.subscribers.delete(id);
    };
  }

  publish(event: WhatsAppRealtimeEvent) {
    for (const subscriber of Array.from(this.subscribers.values())) {
      if (subscriber.tenantId !== event.tenantId) continue;
      if (subscriber.branchId && subscriber.branchId !== event.branchId) continue;
      subscriber.onEvent(event);
    }
  }
}

export const whatsappRealtimeBus = new WhatsAppRealtimeBus();
