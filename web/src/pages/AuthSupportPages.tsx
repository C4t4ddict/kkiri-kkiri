import { FormEvent, useState } from 'react';
import { ArrowLeft, CheckCircle2, MailCheck, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../shared/api/client';

type VerificationResult = { development_code?: string | number; message?: string };

function AuthFrame({ children }: { children: React.ReactNode }) {
  return <main className="auth-support-page"><section className="auth-support-card">
    <Link className="back-link" to="/login"><ArrowLeft size={16} /> 로그인</Link>
    <Link className="wordmark" to="/login">끼리끼리</Link>
    {children}
  </section></main>;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다'); }
    finally { setBusy(false); }
  };

  const requestCode = () => run(async () => {
    const result = await api<VerificationResult>('/auth/email-verification/request', { method: 'POST', body: JSON.stringify({ email }) });
    setCodeSent(true);
    if (result.development_code) setCode(String(result.development_code));
    setMessage(result.development_code ? '개발 환경 인증 코드를 자동으로 입력했습니다.' : '인증 코드를 이메일로 보냈습니다.');
  });

  const verify = () => run(async () => {
    await api('/auth/email-verification/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
    setVerified(true); setMessage('이메일 인증이 완료되었습니다.');
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (!verified) return setError('이메일 인증을 먼저 완료해주세요.');
    if (password !== form.get('password_confirm')) return setError('비밀번호 확인이 일치하지 않습니다.');
    run(async () => {
      await api('/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          name: form.get('name'),
          department: form.get('department'),
          studentId: form.get('studentId'),
          birth: form.get('birth'),
        }),
      });
      navigate('/login', { replace: true });
    });
  };

  return <AuthFrame>
    <div className="auth-support-head"><span><MailCheck /></span><h1>회원가입</h1><p>학교 이메일이면 본교 전용 모집도 이용할 수 있어요.</p></div>
    <form className="stack-form" onSubmit={submit}>
      <label>이메일<div className="inline-field"><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setVerified(false); setCodeSent(false); }} required /><button type="button" className="ghost-button" disabled={busy || !email} onClick={requestCode}>인증 요청</button></div></label>
      {codeSent && <label>인증 코드<div className="inline-field"><input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} disabled={verified} required /><button type="button" className="ghost-button" disabled={busy || verified || code.length !== 6} onClick={verify}>{verified ? '인증 완료' : '확인'}</button></div></label>}
      <div className="form-grid two"><label>이름<input name="name" required /></label><label>학과<input name="department" /></label><label>학번<input name="studentId" /></label><label>생년월일<input name="birth" type="date" /></label><label>비밀번호<input name="password" type="password" minLength={4} required /></label><label>비밀번호 확인<input name="password_confirm" type="password" minLength={4} required /></label></div>
      {message && <div className="form-success"><CheckCircle2 />{message}</div>}{error && <div className="form-error">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? '처리 중…' : '가입하기'}</button>
    </form>
  </AuthFrame>;
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'EMAIL' | 'CODE' | 'PASSWORD'>('EMAIL');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다'); }
    finally { setBusy(false); }
  };

  const requestCode = (event: FormEvent) => { event.preventDefault(); run(async () => {
    const result = await api<VerificationResult>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
    if (result.development_code) setCode(String(result.development_code));
    setStep('CODE'); setMessage(result.development_code ? '개발 환경 인증 코드를 자동으로 입력했습니다.' : '재설정 코드를 이메일로 보냈습니다.');
  }); };
  const verify = (event: FormEvent) => { event.preventDefault(); run(async () => {
    const result = await api<{ reset_token: string }>('/auth/password-reset/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
    setResetToken(result.reset_token); setStep('PASSWORD'); setMessage('인증되었습니다. 새 비밀번호를 정해주세요.');
  }); };
  const confirm = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const password = String(form.get('password') || '');
    if (password !== form.get('password_confirm')) return setError('비밀번호 확인이 일치하지 않습니다.');
    run(async () => { await api('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ reset_token: resetToken, password }) }); navigate('/login', { replace: true }); });
  };

  return <AuthFrame>
    <div className="auth-support-head"><span><ShieldCheck /></span><h1>비밀번호 재설정</h1><p>{step === 'EMAIL' ? '가입한 이메일을 입력해주세요.' : step === 'CODE' ? '이메일로 받은 6자리 코드를 확인해주세요.' : '새 비밀번호를 입력해주세요.'}</p></div>
    {step === 'EMAIL' && <form className="stack-form" onSubmit={requestCode}><label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button className="primary-button" disabled={busy}>인증 코드 받기</button></form>}
    {step === 'CODE' && <form className="stack-form" onSubmit={verify}><label>인증 코드<input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></label><button className="primary-button" disabled={busy}>코드 확인</button></form>}
    {step === 'PASSWORD' && <form className="stack-form" onSubmit={confirm}><label>새 비밀번호<input name="password" type="password" minLength={4} required /></label><label>새 비밀번호 확인<input name="password_confirm" type="password" minLength={4} required /></label><button className="primary-button" disabled={busy}>비밀번호 변경</button></form>}
    {message && <div className="form-success"><CheckCircle2 />{message}</div>}{error && <div className="form-error">{error}</div>}
  </AuthFrame>;
}
