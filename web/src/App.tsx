import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, BookOpen, BriefcaseBusiness, CalendarCheck, ChevronRight, FileHeart,
  Heart, Home, LayoutDashboard, LogOut, Search, Send, Sparkles, Target, UserRound,
  UsersRound,
} from 'lucide-react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, clearStoredSession, getStoredSession, setStoredSession, type User } from './api';

type ActivityItem = {
  activity_id: number;
  title: string;
  category?: string;
  topic_category?: string;
  organizer?: string;
  main_image_url?: string;
  application_period_end?: string;
  open_recruitment_count?: number;
};
type Recruitment = {
  recruitment_id: number;
  post_name: string;
  activity_name?: string;
  activity_type?: string;
  meeting_type?: string;
  required_members?: number;
  activity_period?: string;
};
type Application = {
  application_id: number;
  recruitment_id: number;
  post_name: string;
  activity_name?: string;
  application_status: string;
  offer_status?: string | null;
};
type Template = { template_id: number; title: string; content: string; is_default: number | boolean };

const navItems = [
  ['/', '홈', Home], ['/info', '정보', BookOpen], ['/matching', '매칭', UsersRound],
  ['/activity', '활동', Activity], ['/mypage', '마이페이지', UserRound],
] as const;

function useAsync<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader().then((value) => active && setData(value)).catch((reason) => active && setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, dependencies);
  return { data, error, loading, reload: () => loader().then(setData).catch((reason) => setError(reason.message)) };
}

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const result = await api<{ token: string; user: User }>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setStoredSession(result.token, result.user); onLogin(result.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다'); }
    finally { setLoading(false); }
  };
  return <main className="login-page">
    <section className="login-brand"><div className="brand-mark"><Sparkles size={24} /></div><p>KKIRI KKIRI</p><h1>함께할 사람을 찾고,<br />성장한 기록을 남겨요.</h1><div className="login-rings"><span /><span /><span /></div></section>
    <section className="login-panel"><form className="login-card" onSubmit={submit}><Link className="wordmark" to="/">끼리끼리</Link><h2>다시 만나서 반가워요</h2><p>모바일 앱과 같은 계정으로 로그인하세요.</p><label>이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required /></label><label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" required /></label>{error && <div className="form-error">{error}</div>}<button className="primary-button" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button></form></section>
  </main>;
}

function Shell({ user, onLogout, children }: { user: User; onLogout: () => void; children: ReactNode }) {
  return <div className="app-shell"><aside className="sidebar"><Link className="wordmark" to="/">끼리끼리</Link><nav>{navItems.map(([path, label, Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={20} /><span>{label}</span></NavLink>)}</nav><div className="sidebar-foot"><div className="avatar">{user.name?.slice(0, 1) || 'K'}</div><div><strong>{user.name}</strong><small>{user.department || user.email}</small></div><button aria-label="로그아웃" onClick={onLogout}><LogOut size={18} /></button></div></aside><div className="main-column"><header className="topbar"><div className="mobile-wordmark">끼리끼리</div><div className="top-search"><Search size={18} /><span>활동과 팀을 탐색해보세요</span></div><button className="notification-button"><Bell size={20} /></button></header><main className="page">{children}</main></div><nav className="mobile-nav">{navItems.map(([path, label, Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={20} /><span>{label}</span></NavLink>)}</nav></div>;
}

const PageState = ({ loading, error, empty }: { loading?: boolean; error?: string; empty?: string }) => loading ? <div className="state-card">불러오는 중…</div> : error ? <div className="state-card error">{error}</div> : empty ? <div className="state-card">{empty}</div> : null;
const Dday = ({ end }: { end?: string }) => { if (!end) return <span>일정 확인</span>; const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000); return <span>{days < 0 ? '마감' : `접수중 D-${days}`}</span>; };

function ActivityCard({ item }: { item: ActivityItem }) {
  return <article className="activity-card">{item.main_image_url ? <img src={item.main_image_url.replace('10.0.2.2', 'localhost')} alt="" /> : <div className="poster-fallback"><Sparkles /></div>}<div className="activity-card-body"><div className="card-tags"><span>{item.topic_category || item.category || '활동'}</span><Dday end={item.application_period_end} /></div><h3>{item.title}</h3><p>{item.organizer || '주최기관 확인 필요'}</p>{Number(item.open_recruitment_count) > 0 && <div className="recruit-count">모집글 +{item.open_recruitment_count}</div>}</div></article>;
}

function HomePage({ user }: { user: User }) {
  const activities = useAsync(() => api<{ items: ActivityItem[] }>('/api/activities/open?page=1&limit=6'), []);
  const applications = useAsync(() => api<Application[]>('/api/my-applications'), []);
  const items = activities.data?.items || [];
  return <><section className="hero-banner"><div><span className="eyebrow">WELCOME BACK</span><h1>{user.name}님, 다음 성장을<br />함께 시작해볼까요?</h1><p>새로운 공모전과 팀 모집 현황을 한 곳에서 확인하세요.</p><Link className="hero-cta" to="/info">활동 둘러보기 <ChevronRight size={18} /></Link></div><div className="hero-visual"><span className="orbit one" /><span className="orbit two" /><Target size={68} /></div></section><section className="metrics-grid"><Metric icon={<CalendarCheck />} label="접수 중 활동" value={`${items.length}+`} /><Metric icon={<Send />} label="나의 지원" value={`${applications.data?.length || 0}`} /><Metric icon={<UsersRound />} label="모집 중인 팀" value="탐색" /><Metric icon={<FileHeart />} label="성장 기록" value="관리" /></section><SectionHead title="지금 지원할 수 있는 활동" link="/info" />{activities.loading || activities.error ? <PageState loading={activities.loading} error={activities.error} /> : <div className="activity-grid">{items.map((item) => <ActivityCard key={item.activity_id} item={item} />)}</div>}</>;
}
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="metric"><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>; }
function SectionHead({ title, link }: { title: string; link?: string }) { return <div className="section-head"><h2>{title}</h2>{link && <Link to={link}>전체보기 <ChevronRight size={16} /></Link>}</div>; }

function InfoPage() {
  const [query, setQuery] = useState('');
  const result = useAsync(() => api<ActivityItem[]>('/api/activities'), []);
  const filtered = useMemo(() => (result.data || []).filter((item) => `${item.title} ${item.organizer} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [query, result.data]);
  return <><PageTitle eyebrow="DISCOVER" title="활동 정보" description="공모전, 대외활동, 교육과 행사를 한 번에 찾아보세요." /><div className="search-field"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="활동명이나 주최기관 검색" /></div><PageState loading={result.loading} error={result.error} empty={!result.loading && !filtered.length ? '조건에 맞는 활동이 없습니다.' : undefined} /><div className="activity-grid">{filtered.slice(0, 40).map((item) => <ActivityCard key={item.activity_id} item={item} />)}</div></>;
}

function MatchingPage() {
  const result = useAsync(() => api<Recruitment[]>('/api/team-recruitments'), []);
  return <><PageTitle eyebrow="TEAM MATCHING" title="함께할 팀 찾기" description="관심 활동을 중심으로 조건이 맞는 팀을 찾아보세요." /><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '현재 모집 중인 팀이 없습니다.' : undefined} /><div className="recruitment-list">{result.data?.map((item) => <article className="recruitment-card" key={item.recruitment_id}><div className="recruit-icon"><UsersRound /></div><div className="recruit-copy"><div className="card-tags"><span>{item.activity_type || '팀 활동'}</span><span>{item.meeting_type || '방식 협의'}</span></div><h3>{item.post_name}</h3><p>{item.activity_name}</p><small>{item.activity_period || '기간 협의'} · {item.required_members || '-'}명 모집</small></div><ChevronRight className="recruit-arrow" /></article>)}</div></>;
}

function ActivityPage({ user }: { user: User }) {
  const active = useAsync(() => api<any[]>('/my-teams'), []);
  const past = useAsync(() => api<any[]>(`/users/${user.id}/past-activities`), [user.id]);
  return <><PageTitle eyebrow="MY ACTIVITY" title="나의 활동" description="진행 중인 목표와 지난 활동의 성장 기록을 관리하세요." /><div className="activity-summary"><div className="progress-ring"><div><strong>68%</strong><span>이번 달</span></div></div><div><span className="eyebrow">MONTHLY PROGRESS</span><h2>목표를 향해 꾸준히 성장 중이에요</h2><p>모바일 앱의 일일·주간·월간 목표와 같은 데이터가 웹에서도 연결됩니다.</p></div></div><div className="two-columns"><section><SectionHead title="진행 중인 활동" />{active.loading ? <PageState loading /> : (active.data || []).map((team) => <div className="simple-row" key={team.team_id}><div className="row-icon"><BriefcaseBusiness /></div><div><strong>{team.activity_name || team.team_name || `활동 ${team.team_id}`}</strong><span>{team.part || team.role || '역할 설정 전'}</span></div></div>)}</section><section><SectionHead title="지난 활동" />{past.loading ? <PageState loading /> : (past.data || []).slice(0, 5).map((portfolio) => <div className="simple-row" key={portfolio.portfolio_id}><div className="row-icon"><FileHeart /></div><div><strong>{portfolio.activity_name}</strong><span>{portfolio.role || '역할 미정'} · {portfolio.completed_task_count || 0}개 완료</span></div></div>)}</section></div></>;
}

function MyPage({ user }: { user: User }) {
  const menus = [['나의 지원', '지원 단계와 합류 제안을 확인합니다.', '/mypage/applications', Send], ['지원서 관리', '자주 쓰는 지원 내용을 템플릿으로 관리합니다.', '/mypage/templates', FileHeart], ['관심 활동', '저장한 활동을 다시 확인합니다.', '/info', Heart], ['미니포트폴리오', '지난 활동과 성과를 정리합니다.', '/activity', BriefcaseBusiness]] as const;
  return <><section className="profile-card"><div className="profile-avatar">{user.name.slice(0, 1)}</div><div><span className="eyebrow">MY PROFILE</span><h1>{user.name}</h1><p>{user.email} · {user.department || '학과 미등록'}</p></div></section><div className="menu-grid">{menus.map(([title, description, path, Icon]) => <Link className="menu-card" to={path} key={title}><div className="menu-icon"><Icon /></div><div><h3>{title}</h3><p>{description}</p></div><ChevronRight /></Link>)}</div></>;
}

function ApplicationsPage() {
  const result = useAsync(() => api<Application[]>('/api/my-applications'), []);
  return <><PageTitle eyebrow="APPLICATIONS" title="나의 지원" description="지원부터 팀 합류까지 진행 상황을 확인하세요." /><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '지원한 모집글이 없습니다.' : undefined} /><div className="recruitment-list">{result.data?.map((item) => <Link to={`/mypage/applications/${item.application_id}`} className="application-row" key={item.application_id}><StatusPill application={item} /><div><h3>{item.post_name}</h3><p>{item.activity_name}</p></div><ChevronRight /></Link>)}</div></>;
}

function StatusPill({ application }: { application: Application }) { const label = application.offer_status === 'PENDING' ? '합류 제안' : application.application_status === 'APPROVED' ? '합류 완료' : application.application_status === 'REJECTED' ? '종료' : application.application_status === 'CANCELED' ? '취소' : '검토 중'; return <span className={`status-pill ${application.application_status.toLowerCase()}`}>{label}</span>; }

function ApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const result = useAsync(() => api<any>(`/api/my-applications/${id}`), [id]);
  const respond = async (path: string, body?: object) => { await api(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }); await result.reload(); };
  if (result.loading || result.error || !result.data) return <PageState loading={result.loading} error={result.error} />;
  const detail = result.data;
  return <><button className="back-link" onClick={() => navigate(-1)}>← 나의 지원</button><PageTitle eyebrow="APPLICATION STATUS" title={detail.post_name} description={detail.activity_name} /><div className="detail-grid"><section className="content-card"><SectionHead title="지원 진행 상황" /> <div className="timeline">{detail.timeline.map((step: any) => <div className={`timeline-step ${step.state}`} key={step.key}><span className="timeline-dot">{step.state === 'completed' ? '✓' : ''}</span><div><strong>{step.label}</strong><small>{step.state === 'current' ? '현재 단계' : step.occurred_at ? new Date(step.occurred_at).toLocaleString('ko-KR') : '예정'}</small></div></div>)}</div></section><section className="content-card"><SectionHead title="제출한 지원 내용" /><p className="long-copy">{detail.memo}</p>{detail.offer_id && detail.offer_status === 'PENDING' ? <div className="button-row"><button className="ghost-button" onClick={() => respond(`/api/team-join-offers/${detail.offer_id}/respond`, { decision: 'REJECTED' })}>거절</button><button className="primary-button" onClick={() => respond(`/api/team-join-offers/${detail.offer_id}/respond`, { decision: 'ACCEPTED' })}>팀 합류하기</button></div> : ['PENDING', 'APPROVED'].includes(detail.application_status) && <button className="danger-button" onClick={() => respond(`/api/applications/${detail.application_id}/cancel`)}>지원 취소</button>}</section></div></>;
}

function TemplatesPage() {
  const result = useAsync(() => api<Template[]>('/api/application-templates'), []);
  const [editing, setEditing] = useState<Template | null | undefined>(undefined);
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = JSON.stringify({ title: form.get('title'), content: form.get('content'), is_default: form.get('is_default') === 'on' }); await api(editing ? `/api/application-templates/${editing.template_id}` : '/api/application-templates', { method: editing ? 'PUT' : 'POST', body }); setEditing(undefined); await result.reload(); };
  const remove = async (id: number) => { if (!confirm('이 지원서를 삭제할까요?')) return; await api(`/api/application-templates/${id}`, { method: 'DELETE' }); await result.reload(); };
  return <><div className="title-actions"><PageTitle eyebrow="APPLICATION LIBRARY" title="지원서 관리" description="자주 사용하는 지원 내용을 저장하고 모집글에서 불러오세요." /><button className="primary-button compact" onClick={() => setEditing(null)}>새 템플릿</button></div><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '첫 지원서 템플릿을 만들어보세요.' : undefined} /><div className="template-grid">{result.data?.map((template) => <article className="template-card" key={template.template_id}><div><h3>{template.title} {template.is_default && <span>기본</span>}</h3><p>{template.content}</p></div><div className="button-row"><button className="ghost-button" onClick={() => setEditing(template)}>수정</button><button className="text-danger" onClick={() => remove(template.template_id)}>삭제</button></div></article>)}</div>{editing !== undefined && <div className="modal-backdrop"><form className="web-modal" onSubmit={save}><div className="modal-head"><h2>{editing ? '지원서 수정' : '새 지원서'}</h2><button type="button" onClick={() => setEditing(undefined)}>×</button></div><label>템플릿 이름<input name="title" maxLength={80} defaultValue={editing?.title} required /></label><label>지원 내용<textarea name="content" maxLength={2000} rows={10} defaultValue={editing?.content} required /></label><label className="check-label"><input type="checkbox" name="is_default" defaultChecked={Boolean(editing?.is_default)} /> 기본 지원서로 사용</label><button className="primary-button">저장하기</button></form></div>}</>;
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>; }

export default function App() {
  const [user, setUser] = useState<User | null>(() => getStoredSession()?.user || null);
  const logout = () => { clearStoredSession(); setUser(null); };
  if (!user) return <Routes><Route path="*" element={<LoginPage onLogin={setUser} />} /></Routes>;
  return <Shell user={user} onLogout={logout}><Routes><Route path="/" element={<HomePage user={user} />} /><Route path="/info" element={<InfoPage />} /><Route path="/matching" element={<MatchingPage />} /><Route path="/activity" element={<ActivityPage user={user} />} /><Route path="/mypage" element={<MyPage user={user} />} /><Route path="/mypage/applications" element={<ApplicationsPage />} /><Route path="/mypage/applications/:id" element={<ApplicationDetailPage />} /><Route path="/mypage/templates" element={<TemplatesPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Shell>;
}
