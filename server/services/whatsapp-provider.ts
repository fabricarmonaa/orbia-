import type { TenantWhatsappChannel } from "@shared/schema";
import { decryptSecret } from "./whatsapp-crypto";

export interface WhatsappProvider {
  sendTextMessage(channel: TenantWhatsappChannel, to: string, text: string): Promise<{ providerMessageId?: string; raw: unknown; mocked?: boolean }>;
  sendTemplateMessage(
    channel: TenantWhatsappChannel,
    to: string,
    templateCode: string,
    params?: string[],
  ): Promise<{ providerMessageId?: string; raw: unknown; mocked?: boolean }>;
}

class MetaWhatsappProvider implements WhatsappProvider {
  private getToken(channel: TenantWhatsappChannel) {
    return decryptSecret(channel.accessTokenEncrypted);
  }

  async sendTextMessage(channel: TenantWhatsappChannel, to: string, text: string) {
    const token = this.getToken(channel);
    if (!token || !channel.phoneNumberId) {
      return { mocked: true, raw: { mocked: true, reason: "missing_credentials", to, text } };
    }

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    };

    const response = await fetch(`https://graph.facebook.com/v21.0/${channel.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Meta API error (${response.status}): ${JSON.stringify(raw)}`);
    }
    return { providerMessageId: raw?.messages?.[0]?.id, raw };
  }

  async sendTemplateMessage(channel: TenantWhatsappChannel, to: string, templateCode: string, params: string[] = []) {
    const token = this.getToken(channel);
    if (!token || !channel.phoneNumberId) {
      return { mocked: true, raw: { mocked: true, reason: "missing_credentials", to, templateCode, params } };
    }

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateCode,
        language: { code: "es_AR" },
        components: params.length
          ? [{ type: "body", parameters: params.map((value) => ({ type: "text", text: value })) }]
          : [],
      },
    };

    const response = await fetch(`https://graph.facebook.com/v21.0/${channel.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Meta API error (${response.status}): ${JSON.stringify(raw)}`);
    }
    return { providerMessageId: raw?.messages?.[0]?.id, raw };
  }
}

export function resolveWhatsappProvider(provider: string): WhatsappProvider {
  if (provider === "meta") return new MetaWhatsappProvider();
  throw new Error(`Unsupported WhatsApp provider: ${provider}`);
}
