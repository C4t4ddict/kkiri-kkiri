const nodemailer = require('nodemailer');

let transporter;

const isDevelopmentEnvironment = () => process.env.NODE_ENV === 'development';

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
};

const getVerificationSubject = (purpose) => ({
  SIGNUP: '[끼리끼리] 회원가입 이메일 인증 코드',
  SCHOOL_LINK: '[끼리끼리] 학교 이메일 인증 코드',
  PASSWORD_RESET: '[끼리끼리] 비밀번호 재설정 인증 코드',
}[purpose] || '[끼리끼리] 이메일 인증 코드');

const sendVerificationCode = async ({ email, code, purpose }) => {
  const subject = getVerificationSubject(purpose);
  const mailer = getTransporter();
  if (!mailer) {
    if (!isDevelopmentEnvironment()) {
      const error = new Error('이메일 발송 설정이 완료되지 않았습니다');
      error.code = 'EMAIL_NOT_CONFIGURED';
      throw error;
    }
    return { deliveryMode: 'development', developmentCode: code };
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject,
    text: `끼리끼리 인증 코드는 ${code}입니다. 10분 안에 입력해주세요.`,
    html: `<div style="font-family:Arial,sans-serif;padding:24px;color:#101828"><h2 style="color:#7A5AF8">끼리끼리 이메일 인증</h2><p>아래 인증 코드를 10분 안에 입력해주세요.</p><div style="font-size:30px;font-weight:800;letter-spacing:8px;padding:18px;background:#F4F0FF;border-radius:14px;text-align:center">${code}</div><p style="margin-top:20px;color:#667085">본인이 요청하지 않았다면 이 메일을 무시해주세요.</p></div>`,
  });
  return { deliveryMode: 'smtp' };
};

module.exports = { getVerificationSubject, sendVerificationCode };
