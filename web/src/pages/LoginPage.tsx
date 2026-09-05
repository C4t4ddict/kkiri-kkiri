import { FormEvent, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import type { User } from '../shared/types/domain';

export function LoginPage() {
  const { login, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api<{ token: string; user: User }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      login(result.token, result.user);
      const destination = typeof location.state?.from === 'string' ? location.state.from : '/';
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  if (user) return <Navigate to="/" replace />;

  const asciiFrames = [
    String.raw`       .                 *
      /|\               /|\
     / | \      +      / | \
    o--+--o .......... o--+--o
       |       kkiri      |
       o ................. o`,
    String.raw`             .     *
       |                 |
    o--+--o ....+..... o--+--o
     \ | /    kkiri     \ | /
      \|/                 \|/
       ' ................. '`,
    String.raw`       *           .
      \|/               \|/
       o ......+......... o
      /|\     kkiri      /|\
     o-+-o ............ o-+-o
       |                 |`,
    String.raw`       +                 .
       |                 |
     .-o-.             .-o-.
    /  |  \... kkiri ../  |  \
    o--+--o           o--+--o
        * ............. +`,
  ];

  return <main className="login-page">
    <div className="login-backdrop-copy" aria-hidden="true">KKIRI · CONNECT · CREATE · GROW ·</div>
    <section className="login-panel">
      <div className="login-brand">
        <Link className="login-wordmark" to="/"><span><Sparkles size={20} /></span>끼리끼리</Link>
        <p>같이 시작하고, 함께 완성하는 활동 공간</p>
      </div>
      <div className="login-ascii" aria-hidden="true">
        <div className="login-ascii-bar"><span>●</span><span>●</span><span>●</span><em>kkiri_network.exe</em></div>
        <div className="login-ascii-stage">
          {asciiFrames.map((frame, index) => <pre key={frame} style={{ animationDelay: `${index * 1.2}s` }}>{frame}</pre>)}
        </div>
        <div className="login-ascii-status"><span>&gt; FINDING YOUR PEOPLE_</span><span>[ ONLINE ]</span></div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-copy">
          <span>WELCOME BACK</span>
          <h1>다시 만나서 반가워요</h1>
          <p>모바일 앱과 같은 계정으로 로그인하세요.</p>
        </div>
        <label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
        <label>비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
        <div className="auth-links"><Link to="/register">회원가입</Link><Link to="/forgot-password">비밀번호 찾기</Link></div>
      </form>
    </section>
  </main>;
}
