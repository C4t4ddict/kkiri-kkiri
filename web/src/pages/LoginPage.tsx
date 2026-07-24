import { FormEvent, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import type { User } from '../shared/types/domain';

export function LoginPage() {
  const { login } = useAuth();
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-mark"><Sparkles size={24} /></div>
      <p>KKIRI KKIRI</p>
      <h1>함께할 사람을 찾고,<br />성장한 기록을 남겨요.</h1>
      <div className="login-rings"><span /><span /><span /></div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <Link className="wordmark" to="/">끼리끼리</Link>
        <h2>다시 만나서 반가워요</h2>
        <p>모바일 앱과 같은 계정으로 로그인하세요.</p>
        <label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
        <label>비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
      </form>
    </section>
  </main>;
}
