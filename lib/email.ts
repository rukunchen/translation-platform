// Resend 邮件发送封装
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://translation-platform-omega.vercel.app'

type InviteEmailParams = {
  to: string
  projectName: string
  inviterName: string
  role: '译员' | '审校'
  token: string
}

export async function sendInviteEmail(params: InviteEmailParams) {
  const { to, projectName, inviterName, role, token } = params
  const acceptUrl = `${SITE_URL}/invite/${token}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F0EEE5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:#1F1E1D;padding:24px 32px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;background:#D97757;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-weight:bold;font-size:14px;">译</span>
        </div>
        <span style="color:#fff;font-size:16px;font-weight:600;">译境</span>
        <span style="color:#7A7872;font-size:12px;">— 技大25级MTIer翻译平台</span>
      </div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="font-size:24px;color:#1F1E1D;margin:0 0 16px;line-height:1.3;">你被邀请加入翻译项目</h1>
      <p style="color:#3D3D3A;font-size:15px;line-height:1.7;margin:0 0 24px;">
        <strong>${escape(inviterName)}</strong> 邀请你以
        <strong style="color:#D97757;">${role}</strong>
        的身份加入项目「<strong>${escape(projectName)}</strong>」。
      </p>
      <p style="color:#7A7872;font-size:14px;line-height:1.7;margin:0 0 28px;">
        点击下方按钮接受邀请。如果你还没有账号，会引导你先注册再自动加入项目。
      </p>
      <a href="${acceptUrl}" style="display:inline-block;background:#1F1E1D;color:#fff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:500;font-size:14px;">
        接受邀请 →
      </a>
      <p style="color:#A8A29E;font-size:12px;line-height:1.7;margin:36px 0 0;">
        或复制链接到浏览器打开：<br>
        <a href="${acceptUrl}" style="color:#D97757;word-break:break-all;">${acceptUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #E0DDD3;margin:32px 0;">
      <p style="color:#A8A29E;font-size:12px;line-height:1.7;margin:0;">
        这封邀请将在 7 天后过期。如果你不认识 ${escape(inviterName)} 或不想加入，可以忽略此邮件。
      </p>
    </div>
    <div style="background:#FAF9F6;padding:20px 32px;text-align:center;">
      <p style="color:#A8A29E;font-size:11px;margin:0;">译境 — 技大25级MTIer翻译平台</p>
    </div>
  </div>
</body>
</html>`

  try {
    const result = await resend.emails.send({
      from: '译境 <onboarding@resend.dev>',
      to,
      subject: `${inviterName} 邀请你加入翻译项目「${projectName}」`,
      html,
    })
    return { ok: true, id: (result as any)?.data?.id, error: null }
  } catch (e: any) {
    console.error('Resend send error:', e)
    return { ok: false, id: null, error: e?.message || '发送失败' }
  }
}

function escape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
