import nodemailer from 'nodemailer'

function buildPasswordResetHtml(resetLink) {
  const safeLink = resetLink.replace(/"/g, '&quot;')
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #2c2c2c; max-width: 520px; margin: 0 auto;">
      <p style="font-size: 22px; font-style: italic; color: #c0613a; margin: 0 0 24px;">travelah</p>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 12px;">Reset your password</h1>
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px;">
        We received a request to reset your Travelah password. Click the button below to choose a new one.
        This link expires in 1 hour.
      </p>
      <p style="margin: 0 0 24px;">
        <a href="${safeLink}" style="display: inline-block; background: #c0613a; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-size: 14px; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0;">
        If you did not request this, you can ignore this email. Your password will not change.
      </p>
      <p style="font-size: 12px; color: #999; margin: 24px 0 0; word-break: break-all;">
        Or copy this link: ${safeLink}
      </p>
    </div>
  `.trim()
}

function smtpTransport() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (!host || !user || !pass) return null

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: { user, pass },
  })
}

export function isPasswordResetEmailConfigured() {
  if (process.env.RESEND_API_KEY?.trim()) return true
  return Boolean(smtpTransport())
}

async function sendViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null

  const from = process.env.RESEND_FROM?.trim() || 'Travelah <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      data?.message ||
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : null) ||
      `Resend error (${res.status})`
    const err = new Error(message)
    err.code = 'EMAIL_SEND_FAILED'
    throw err
  }

  return { provider: 'resend', id: data.id }
}

async function sendViaSmtp({ to, subject, html, resetLink }) {
  const transport = smtpTransport()
  if (!transport) return null

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim()
  const info = await transport.sendMail({
    from,
    to,
    subject,
    html,
    text: `Reset your Travelah password:\n\n${resetLink}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
  })
  return { provider: 'smtp', id: info.messageId }
}

/** @returns {Promise<{ provider: string, id?: string } | null>} */
export async function sendPasswordResetEmail(to, resetLink) {
  const subject = 'Reset your Travelah password'
  const html = buildPasswordResetHtml(resetLink)

  if (process.env.RESEND_API_KEY?.trim()) {
    return sendViaResend({ to, subject, html })
  }

  if (smtpTransport()) {
    return sendViaSmtp({ to, subject, html, resetLink })
  }

  return null
}
