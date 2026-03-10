import { storage } from "../../storage";

export type MailerRuntimeConfig = {
  from: string;
  replyTo?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

const MAILER_CONFIG_KEY = "gmail_oauth_config";

function readEnvConfig(): Partial<MailerRuntimeConfig> {
  return {
    from: process.env.GMAIL_FROM,
    replyTo: process.env.GMAIL_REPLY_TO,
    clientId: process.env.GMAIL_OAUTH_CLIENT_ID,
    clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_OAUTH_REFRESH_TOKEN,
  };
}

export async function getMailerRuntimeConfig(): Promise<MailerRuntimeConfig | null> {
  const env = readEnvConfig();
  let from = env.from;
  let replyTo = env.replyTo;
  let clientId = env.clientId;
  let clientSecret = env.clientSecret;
  let refreshToken = env.refreshToken;

  try {
    const row = await storage.getSystemSetting(MAILER_CONFIG_KEY);
    if (row?.value) {
      const parsed = JSON.parse(row.value || "{}") as Partial<MailerRuntimeConfig>;
      from = parsed.from || from;
      replyTo = parsed.replyTo || replyTo;
      clientId = parsed.clientId || clientId;
      clientSecret = parsed.clientSecret || clientSecret;
      refreshToken = parsed.refreshToken || refreshToken;
    }
  } catch {
    // fallback to env only
  }

  if (!from || !clientId || !clientSecret || !refreshToken) return null;
  return { from, replyTo, clientId, clientSecret, refreshToken };
}

export async function isMailerConfiguredRuntime() {
  return Boolean(await getMailerRuntimeConfig());
}
