/**
 * Outgoing email (verification codes, password reset).
 * Provider: Resend (RESEND_API_KEY) or Brevo (BREVO_API_KEY). From address: EMAIL_FROM,
 * e.g. "Bet To Beat <no-reply@bettobeat.com>" — the domain must be verified with the provider.
 * With no provider configured, email is off and sign-ups are not asked for a code.
 */
import axios from 'axios';
import logger from '../utils/logger';

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const BREVO_KEY = process.env.BREVO_API_KEY || '';
const FROM = process.env.EMAIL_FROM || 'Bet To Beat <no-reply@bettobeat.com>';

export const emailProvider: 'resend' | 'brevo' | null = RESEND_KEY ? 'resend' : BREVO_KEY ? 'brevo' : null;
export const emailEnabled = !!emailProvider;

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || 'Bet To Beat', email: m[2] } : { name: 'Bet To Beat', email: from.trim() };
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!emailProvider) throw new Error('Email is not configured');
  if (emailProvider === 'resend') {
    await axios.post(
      'https://api.resend.com/emails',
      { from: FROM, to: [to], subject, html, text },
      { headers: { Authorization: `Bearer ${RESEND_KEY}` }, timeout: 15000 }
    );
  } else {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      { sender: parseFrom(FROM), to: [{ email: to }], subject, htmlContent: html, textContent: text },
      { headers: { 'api-key': BREVO_KEY }, timeout: 15000 }
    );
  }
  logger.info(`Email sent (${emailProvider}): ${subject}`);
}

function codeEmail(title: string, intro: string, code: string, outro: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111419">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:460px;background:#ffffff;border:1px solid #e2e5ea;border-radius:16px" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-weight:800;font-size:18px">Bet<span style="color:#10a35a">To</span>Beat</div>
        <h1 style="font-size:20px;margin:20px 0 8px">${title}</h1>
        <p style="font-size:14px;line-height:1.5;color:#646c78;margin:0 0 20px">${intro}</p>
        <div style="font-family:'JetBrains Mono',Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;background:#f0f2f5;border-radius:12px;padding:16px;text-align:center">${code}</div>
        <p style="font-size:13px;line-height:1.5;color:#646c78;margin:20px 0 24px">${outro}</p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:#969da8;margin-top:16px">Bet To Beat · bettobeat.com</p>
  </td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\n${code}\n\n${outro}\n\nBet To Beat · bettobeat.com`;
  return { html, text };
}

export function sendVerificationCode(to: string, code: string) {
  const { html, text } = codeEmail(
    'Confirm your email',
    'Enter this code on Bet To Beat to confirm your email address:',
    code,
    'The code is valid for 10 minutes. If you didn’t create an account, you can ignore this email.'
  );
  return sendEmail(to, `${code} is your Bet To Beat code`, html, text);
}

export function sendResetCode(to: string, code: string) {
  const { html, text } = codeEmail(
    'Reset your password',
    'Enter this code on Bet To Beat to choose a new password:',
    code,
    'The code is valid for 10 minutes. If you didn’t ask to reset your password, you can ignore this email — your password stays the same.'
  );
  return sendEmail(to, `${code} is your Bet To Beat reset code`, html, text);
}
