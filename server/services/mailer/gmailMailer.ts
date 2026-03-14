type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

function extractEmail(value?: string | null) {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function maskEmail(value?: string | null) {
  const email = extractEmail(value);
  const [name, domain] = email.split("@");
  if (!name || !domain) return "<invalid-email>";
  const visible = name.length <= 2 ? `${name[0] || "*"}*` : `${name.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function stripUnsafeHtml(html: string) {
  return String(html || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "");
}

function buildMime({ from, to, subject, html, text, replyTo }: { from: string; to: string; subject: string; html: string; text?: string; replyTo?: string }) {
  const safeHtml = stripUnsafeHtml(html);
  const plain = text || safeHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    safeHtml,
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

function logMailer(level: "info" | "warn" | "error", message: string, extra: Record<string, unknown> = {}) {
  const payload = { scope: "mailer.gmail", ...extra };
  if (level === "error") {
    console.error(`[mailer] ${message}`, payload);
    return;
  }
  if (level === "warn") {
    console.warn(`[mailer] ${message}`, payload);
    return;
  }
  console.log(`[mailer] ${message}`, payload);
}

export function isMailerConfigured() {
  return hasGmailOauth();
}

async function getAccessToken() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    logMailer("warn", "OAuth2 incompleto", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
    });
    const err = new Error("Mailer no configurado");
    (err as any).code = "MAILER_NOT_CONFIGURED";
    throw err;
  }

  logMailer("info", "Solicitando access token OAuth2", { clientIdPrefix: `${clientId.slice(0, 10)}...` });

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
    logMailer("error", "Error obteniendo access token OAuth2", {
      status: resp.status,
      details: details.slice(0, 300),
    });
    const err = new Error(`No se pudo obtener access token Gmail: ${details.slice(0, 300)}`);
    (err as any).code = "MAILER_AUTH_ERROR";
    throw err;
  }

  const data = await resp.json() as { access_token: string; expires_in?: number };
  logMailer("info", "Access token obtenido", { expiresInSec: data.expires_in || null });
  return data.access_token;
}

export async function sendMail(input: SendMailInput) {
  if (!hasGmailOauth()) {
    logMailer("warn", "sendMail abortado: mailer no configurado", {
      hasClientId: !!process.env.GMAIL_OAUTH_CLIENT_ID,
      hasClientSecret: !!process.env.GMAIL_OAUTH_CLIENT_SECRET,
      hasRefreshToken: !!process.env.GMAIL_OAUTH_REFRESH_TOKEN,
      hasFrom: !!process.env.GMAIL_FROM,
      to: maskEmail(input.to),
      subject: input.subject,
    });
    const err = new Error("Mailer no configurado para Gmail OAuth2");
    (err as any).code = "MAILER_NOT_CONFIGURED";
    throw err;
  }

  const from = process.env.GMAIL_FROM!;
  const fromEmail = extractEmail(from);
  const replyTo = input.replyTo || process.env.GMAIL_REPLY_TO || undefined;

  logMailer("info", "Iniciando envío de correo", {
    to: maskEmail(input.to),
    from: maskEmail(fromEmail),
    replyTo: replyTo ? maskEmail(replyTo) : null,
    subject: input.subject,
  });

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
    logMailer("error", "Error enviando correo por Gmail API", {
      status: resp.status,
      to: maskEmail(input.to),
      from: maskEmail(fromEmail),
      details: details.slice(0, 500),
    });
    const err = new Error(`Error enviando correo Gmail: ${details.slice(0, 500)}`);
    (err as any).code = "MAIL_SEND_ERROR";
    throw err;
  }

  const data = await resp.json() as { id?: string; threadId?: string };
  logMailer("info", "Correo enviado correctamente", {
    to: maskEmail(input.to),
    from: maskEmail(fromEmail),
    gmailMessageId: data.id || null,
    gmailThreadId: data.threadId || null,
  });

  return data;
}
