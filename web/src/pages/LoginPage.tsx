import { FormEvent, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import type { User } from '../shared/types/domain';
import { loginDestination } from '../shared/auth/loginDestination';
import { ThemeToggle } from '../shared/ui/ThemeToggle';
import './login.css';

export function LoginPage() {
  const { login, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = loginDestination(location.state?.from);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await api<{ token: string; user: User }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      login(result.token, result.user);
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  if (user) return <Navigate to={destination} replace />;

  return <div className="learning-login">
    <header className="learning-login-header">
      <Link className="learning-login-wordmark" to="/" aria-label="끼리끼리 홈">끼리끼리</Link>
      <div className="learning-login-header-actions">
        <Link to="/info">활동 둘러보기 <ArrowRight size={16} aria-hidden="true" /></Link>
        <ThemeToggle />
      </div>
    </header>
    <main className="learning-login-main">
      <section className="learning-login-intro" aria-labelledby="learning-login-title">
        <p className="learning-login-kicker">스스로 시작하고, 함께 이어가는 배움</p>
        <h1 id="learning-login-title">나의 속도로 배우고.<br /><span>우리의 경험으로 남기고.</span></h1>
        <p className="learning-login-description">목표를 정하는 순간부터, 함께 만든 결과가<br className="learning-login-break" /> 나만의 포트폴리오가 될 때까지.</p>
      </section>
      <form className="learning-login-form" onSubmit={submit} aria-label="로그인" aria-busy={loading}>
        <label htmlFor="login-email">이메일</label>
        <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required disabled={loading} />
        <div className="learning-login-password-label">
          <label htmlFor="login-password">비밀번호</label>
          <Link to="/forgot-password">비밀번호 찾기</Link>
        </div>
        <div className="learning-login-password">
          <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호를 입력하세요" required disabled={loading} />
          <button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button>
        </div>
        {error && <p className="learning-login-error" role="alert">{error}</p>}
        <button className="learning-login-submit" type="submit" disabled={loading}>{loading ? '로그인 중…' : '로그인'}<ArrowRight size={19} aria-hidden="true" /></button>
        <p className="learning-login-signup">아직 끼리끼리 계정이 없나요? <Link to="/register">회원가입</Link></p>
      </form>
      <p className="learning-login-account-note">앱에서 사용하던 계정으로 그대로 시작하세요.</p>
    </main>
    <footer className="learning-login-footer" aria-label="끼리끼리의 학습 흐름">
      <ol>
        <li><span aria-hidden="true">01</span><div><strong>내가 정한 목표</strong><p>관심에서 출발하는 학습 계획</p></div></li>
        <li><span aria-hidden="true">02</span><div><strong>함께하는 실행</strong><p>팀을 만나 쌓아가는 활동 기록</p></div></li>
        <li><span aria-hidden="true">03</span><div><strong>나에게 남는 경험</strong><p>활동이 끝나면 미니 포트폴리오로</p></div></li>
      </ol>
    </footer>
  </div>;
}
