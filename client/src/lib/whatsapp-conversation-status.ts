export const WHATSAPP_CONVERSATION_STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  PENDING_CUSTOMER: "Esperando respuesta del cliente",
  PENDING_BUSINESS: "Pendiente del negocio",
  WAITING_INTERNAL: "En revisión interna",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export function getWhatsappConversationStatusLabel(status?: string | null) {
  if (!status) return "-";
  return WHATSAPP_CONVERSATION_STATUS_LABELS[status] || status;
}
