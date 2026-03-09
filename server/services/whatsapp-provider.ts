import type { TenantWhatsappChannel } from "@shared/schema";
import { decryptSecret } from "./whatsapp-crypto";

export type WhatsAppMetaSemanticCode =
  | "WHATSAPP_META_UNAUTHORIZED_TOKEN"
  | "WHATSAPP_META_RECIPIENT_NOT_ALLOWED"
  | "WHATSAPP_META_INVALID_RECIPIENT"
  | "WHATSAPP_META_WINDOW_CLOSED"
  | "WHATSAPP_META_TEMPLATE_INVALID"
  | "WHATSAPP_META_UNKNOWN_ERROR";

function mapMetaSemanticError(input: {
  status: number;
  code?: number | null;
  subcode?: number | null;
  message?: string | null;
  details?: string | null;
}): { semanticCode: WhatsAppMetaSemanticCode; semanticMessage: string } {
  const status = Number(input.status || 0);
  const code = Number(input.code || 0);
  const subcode = Number(input.subcode || 0);
  const text = `${String(input.message || "")} ${String(input.details || "")}`.toLowerCase();

  if (status === 401 || code === 190 || text.includes("invalid oauth") || text.includes("access token")) {
    return {
      semanticCode: "WHATSAPP_META_UNAUTHORIZED_TOKEN",
      semanticMessage: "El token de Meta venció o no es válido.",
    };
  }

  if (code === 131030 || text.includes("not included in the list") || text.includes("allowed recipients")) {
    return {
      semanticCode: "WHATSAPP_META_RECIPIENT_NOT_ALLOWED",
      semanticMessage: "El número destino no está autorizado en el sandbox de Meta.",
    };
  }

  if (code === 131026 || code === 100 || text.includes("invalid parameter") || text.includes("phone number") || text.includes("invalid recipient")) {
    return {
      semanticCode: "WHATSAPP_META_INVALID_RECIPIENT",
      semanticMessage: "El número destino no tiene formato válido para WhatsApp Cloud API.",
    };
  }

  if (code === 470 || subcode === 2018028 || text.includes("24") || text.includes("outside the allowed window")) {
    return {
      semanticCode: "WHATSAPP_META_WINDOW_CLOSED",
      semanticMessage: "La ventana de 24 horas está cerrada.",
    };
  }

  if (code === 132000 || code === 132001 || code === 132005 || text.includes("template") || text.includes("unapproved")) {
    return {
      semanticCode: "WHATSAPP_META_TEMPLATE_INVALID",
      semanticMessage: "La plantilla de Meta no es válida o no está aprobada.",
    };
  }

  return {
    semanticCode: "WHATSAPP_META_UNKNOWN_ERROR",
    semanticMessage: "Meta rechazó el envío por un motivo no clasificado.",
  };
}

export class WhatsAppProviderError extends Error {
  status: number;
  raw: any;
  code?: number;
  details?: string;
  metaStatus?: number;
  metaCode?: number | null;
  metaSubcode?: number | null;
  metaMessage?: string | null;
  metaDetails?: string | null;
  semanticCode: WhatsAppMetaSemanticCode;
  semanticMessage: string;

  constructor(message: string, status: number, raw: any) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.status = status;
    this.raw = raw;

    const body = raw?.responseBody || raw;
    const topError = body?.error || body || {};
    const metaCode = topError?.code ? Number(topError.code) : null;
    const metaSubcode = topError?.error_subcode ? Number(topError.error_subcode) : null;
    const metaMessage = topError?.message || null;
    const metaDetails = topError?.error_data?.details || topError?.details || null;

    this.code = metaCode ?? undefined;
    this.details = metaDetails || metaMessage || undefined;
    this.metaStatus = raw?.responseStatus || status;
    this.metaCode = metaCode;
    this.metaSubcode = metaSubcode;
    this.metaMessage = metaMessage;
    this.metaDetails = metaDetails;

    const mapped = mapMetaSemanticError({
      status: this.metaStatus || status,
      code: metaCode,
      subcode: metaSubcode,
      message: metaMessage,
      details: metaDetails,
    });
    this.semanticCode = mapped.semanticCode;
    this.semanticMessage = mapped.semanticMessage;
  }
}

export interface WhatsappProvider {
  sendTextMessage(channel: TenantWhatsappChannel, to: string, text: string): Promise<{ providerMessageId?: string; raw: unknown; mocked?: boolean }>;
  sendTemplateMessage(
    channel: TenantWhatsappChannel,
    to: string,
    templateCode: string,
    params?: string[],
    languageCode?: string,
  ): Promise<{ providerMessageId?: string; raw: unknown; mocked?: boolean }>;
}

class MetaWhatsappProvider implements WhatsappProvider {
  private getToken(channel: TenantWhatsappChannel) {
    return decryptSecret(channel.accessTokenEncrypted);
  }

  private async callMeta(channel: TenantWhatsappChannel, body: Record<string, unknown>) {
    const token = this.getToken(channel);
    const endpoint = `https://graph.facebook.com/v21.0/${channel.phoneNumberId}/messages`;
    const requestContext = {
      endpoint,
      phoneNumberId: channel.phoneNumberId,
      businessAccountId: channel.businessAccountId,
      payload: body,
    };

    if (!token || !channel.phoneNumberId) {
      return { mocked: true, raw: { mocked: true, reason: "missing_credentials", requestContext, body } };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const rawBody = await response.json().catch(() => ({}));
    const raw = {
      requestContext,
      responseStatus: response.status,
      responseBody: rawBody,
    };

    if (!response.ok) {
      throw new WhatsAppProviderError(`Meta API error (${response.status})`, response.status, raw);
    }
    return { providerMessageId: rawBody?.messages?.[0]?.id, raw };
  }

  async sendTextMessage(channel: TenantWhatsappChannel, to: string, text: string) {
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    };
    return this.callMeta(channel, body);
  }

  async sendTemplateMessage(channel: TenantWhatsappChannel, to: string, templateCode: string, params: string[] = [], languageCode = "es_AR") {
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateCode,
        language: { code: languageCode },
        components: params.length
          ? [{ type: "body", parameters: params.map((value) => ({ type: "text", text: value })) }]
          : [],
      },
    };
    return this.callMeta(channel, body);
  }
}

export function resolveWhatsappProvider(provider: string): WhatsappProvider {
  if (provider === "meta") return new MetaWhatsappProvider();
  throw new Error(`Unsupported WhatsApp provider: ${provider}`);
}
