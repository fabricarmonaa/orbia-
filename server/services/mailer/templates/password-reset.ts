type PasswordResetTemplateInput = {
  appName: string;
  logoUrl?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
};

export function renderPasswordResetTemplate(input: PasswordResetTemplateInput) {
  const appName = input.appName || "Orbia";
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;background:#f5f7fb;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
      <div style="padding:20px 24px;background:linear-gradient(135deg,#1f2937 0%,#111827 100%);color:#fff;">
        ${input.logoUrl ? `<img src="${input.logoUrl}" alt="${appName}" style="height:34px;max-width:160px;object-fit:contain;display:block;margin-bottom:10px;"/>` : ""}
        <h1 style="margin:0;font-size:20px;">Restablecer contraseña</h1>
        <p style="margin:8px 0 0;opacity:.9;font-size:13px;">Seguridad de acceso · ${appName}</p>
      </div>
      <div style="padding:24px;color:#111827;line-height:1.55;">
        <p style="margin:0 0 12px;">Se solicitó un cambio de contraseña de tu cuenta en <strong>${appName}</strong>.</p>
        <p style="margin:0 0 16px;">Si fuiste vos, continuá con el proceso desde el botón de abajo. Si no realizaste esta solicitud, podés ignorar este mensaje y contactar soporte.</p>
        <div style="margin:24px 0;">
          <a href="${input.resetUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Restaurar contraseña</a>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#4b5563;">Este enlace vence en ${input.expiresInMinutes} minutos y solo puede usarse una vez.</p>
        <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br/>${input.resetUrl}</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Se solicitó un cambio de contraseña de tu cuenta en ${appName}.`,
    "",
    "Si fuiste vos, continuá con el enlace de restauración. Si no, ignorá este correo y contactá soporte.",
    "",
    `Restaurar contraseña: ${input.resetUrl}`,
    `Vence en ${input.expiresInMinutes} minutos y es de un solo uso.`,
  ].join("\n");

  return { html, text };
}
