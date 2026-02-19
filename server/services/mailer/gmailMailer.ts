type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

function extractEmail(value?: string | null) {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildMime({ from, to, subject, html, text, replyTo }: { from: string; to: string; subject: string; html: string; text?: string; replyTo?: string }) {
  const plain = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const boundary = `orbia_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    plain,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

function hasGmailOauth() {
  return !!(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
    process.env.GMAIL_OAUTH_CLIENT_SECRET &&
    process.env.GMAIL_OAUTH_REFRESH_TOKEN &&
    process.env.GMAIL_FROM
  );
}

export function isMailerConfigured() {
  return hasGmailOauth();
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 20_000) return tokenCache.accessToken;

  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const err = new Error("Mailer no configurado");
    (err as any).code = "MAILER_NOT_CONFIGURED";
    throw err;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const details = await resp.text();
    const err = new Error(`No se pudo obtener access token Gmail: ${details.slice(0, 300)}`);
    (err as any).code = "MAILER_AUTH_ERROR";
    throw err;
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(30, data.expires_in || 3500) * 1000,
  };

  return data.access_token;
}

export async function sendMail(input: SendMailInput) {
  if (!hasGmailOauth()) {
    const err = new Error("Mailer no configurado para Gmail OAuth2");
    (err as any).code = "MAILER_NOT_CONFIGURED";
    throw err;
  }

  const from = process.env.GMAIL_FROM!;
  const fromEmail = extractEmail(from);
  const replyTo = input.replyTo || process.env.GMAIL_REPLY_TO || undefined;

  const mime = buildMime({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo,
  });

  const accessToken = await getAccessToken();
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(fromEmail)}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: toBase64Url(mime) }),
  });

  if (!resp.ok) {
    const details = await resp.text();
    const err = new Error(`Error enviando correo Gmail: ${details.slice(0, 500)}`);
    (err as any).code = "MAIL_SEND_ERROR";
    throw err;
  }

  return resp.json();
}
