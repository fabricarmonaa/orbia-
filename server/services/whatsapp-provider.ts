import type { TenantWhatsappChannel } from "@shared/schema";
import { decryptSecret } from "./whatsapp-crypto";

export class WhatsAppProviderError extends Error {
  status: number;
  raw: any;
  code?: number;
  details?: string;

  constructor(message: string, status: number, raw: any) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.status = status;
    this.raw = raw;
    const body = raw?.responseBody || raw;
    const firstError = body?.error_data?.details
      ? { code: body?.code, details: body?.error_data?.details }
      : body?.error
        ? { code: body?.error?.code, details: body?.error?.error_data?.details || body?.error?.message }
        : null;
    this.code = firstError?.code;
    this.details = firstError?.details;
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
