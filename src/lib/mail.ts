// Transactional email over plain HTTPS (Resend's REST API) so there's no SMTP
// library, no native dependency and nothing to install — just an API key.
//
// If no key is configured, mailEnabled is false and callers must say so plainly
// rather than pretending a message was sent.

const RESEND_KEY = process.env.RESEND_API_KEY || (import.meta as any).env?.RESEND_API_KEY || '';
const FROM = process.env.MAIL_FROM || (import.meta as any).env?.MAIL_FROM || '';
export const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL || (import.meta as any).env?.SUPPORT_EMAIL || 'support@citerank.app';

export const mailEnabled = Boolean(RESEND_KEY && FROM);

export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!mailEnabled) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Absolute site origin, needed to build links inside emails. */
export function siteOrigin(request: Request): string {
  const configured = process.env.SITE_URL || (import.meta as any).env?.SITE_URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  try {
    const u = new URL(request.url);
    const host = request.headers.get('x-forwarded-host') || u.host;
    const proto = request.headers.get('x-forwarded-proto') || u.protocol.replace(':', '');
    return `${proto}://${host}`;
  } catch {
    return '';
  }
}

export function resetEmail(link: string): { html: string; text: string } {
  const text = `Reset your AI Page Audit password

Click the link below to choose a new password. It expires in one hour and can
only be used once.

${link}

If you didn't ask for this, you can ignore this email — your password won't
change.`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0f172a">
  <h1 style="font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0 0 14px">Reset your AI Page Audit password</h1>
  <p style="font-size:15px;line-height:1.65;color:#334155;margin:0 0 22px">Choose a new password using the button below. The link expires in one hour and can only be used once.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#0891b2;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Choose a new password</a></p>
  <p style="font-size:13px;line-height:1.6;color:#64748b;margin:0 0 8px">Or paste this into your browser:</p>
  <p style="font-size:12.5px;color:#64748b;word-break:break-all;margin:0 0 22px">${link}</p>
  <p style="font-size:13px;line-height:1.6;color:#94a3b8;margin:0;border-top:1px solid #e6ebf1;padding-top:16px">If you didn't ask for this, ignore this email — your password won't change.</p>
</div>`;

  return { html, text };
}
