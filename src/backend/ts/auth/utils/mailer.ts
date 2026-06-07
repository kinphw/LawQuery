import nodemailer, { Transporter } from 'nodemailer';

/**
 * 이메일 발송 (Gmail SMTP).
 *
 * 설정(.env):
 *   GMAIL_USER=보내는_gmail_주소@gmail.com
 *   GMAIL_APP_PASSWORD=구글 앱비밀번호 16자리(공백 제거)
 *     · 구글 계정 → 보안 → 2단계 인증 ON → "앱 비밀번호" 생성
 *
 * 미설정 시: 실제 발송 대신 서버 콘솔에 코드를 찍는다(개발 편의). 운영에선 반드시 설정.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return transporter;
}

export function isMailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/**
 * 인증번호 메일 발송. 성공 true / 실패 false.
 * - 미설정 + 운영(production): false (가짜 성공 금지 → 호출부가 에러 처리)
 * - 미설정 + 개발: 콘솔에 코드 출력 후 true (dev 편의, devCode로도 노출됨)
 */
export async function sendVerifyCode(to: string, code: string): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[mailer] GMAIL 미설정 — 운영에서 메일 발송 불가(GMAIL_USER/GMAIL_APP_PASSWORD 확인)');
      return false;
    }
    console.log(`[mailer:DEV] 메일 미설정 → ${to} 인증번호: ${code}`);
    return true;
  }
  try {
    await tx.sendMail({
      from: `LawQuery <${process.env.GMAIL_USER}>`,
      to,
      subject: '[LawQuery] 이메일 인증번호',
      text: `LawQuery 인증번호: ${code}\n\n10분 안에 입력해 주세요. 본인이 요청하지 않았다면 무시하세요.`,
      html:
        `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto">` +
        `<h2 style="margin:0 0 8px">LawQuery 이메일 인증</h2>` +
        `<p style="color:#555;margin:0 0 16px">아래 인증번호를 입력해 가입을 완료해 주세요.</p>` +
        `<div style="font-size:28px;font-weight:700;letter-spacing:6px;background:#f1f3f5;` +
        `border-radius:8px;padding:14px;text-align:center">${code}</div>` +
        `<p style="color:#888;font-size:13px;margin:16px 0 0">10분 안에 입력해 주세요. ` +
        `본인이 요청하지 않았다면 이 메일을 무시하세요.</p></div>`,
    });
    return true;
  } catch (e) {
    console.error('메일 발송 실패:', e);
    return false;
  }
}
