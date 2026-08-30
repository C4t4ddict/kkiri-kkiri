/* eslint-disable no-alert */
import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Award, CheckCircle2, Download, Edit3, ExternalLink, ImagePlus, MessageSquareText, Save, Settings, Trophy } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { ActivityCard } from '../features/activities/ActivityCard';
import { API_BASE_URL, api } from '../shared/api/client';
import { resolveApiMediaUrl } from '../shared/api/media';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, AwardItem, PastActivity, Portfolio } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';
import { UserAvatar } from '../shared/ui/UserAvatar';

export function FavoritesPage() {
  const result = useAsync(() => api<ActivityItem[]>('/api/favorite-activities'), []);
  return <><PageTitle eyebrow="SAVED ACTIVITIES" title="관심 활동" description="저장해둔 공모전과 대외활동을 한곳에서 다시 확인하세요." /><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '관심 활동을 아직 저장하지 않았습니다.' : undefined} /><div className="activity-grid">{result.data?.map((item) => <ActivityCard item={item} key={item.activity_id} />)}</div></>;
}

export function AccountSettingsPage() {
  const { user, updateUser, refreshUser, logout } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() => JSON.parse(localStorage.getItem('kkiri_notification_preferences') || '{"matching":true,"activity":true,"todo":true,"notice":true}'));
  if (!user) return null;

  const run = async (work: () => Promise<unknown>, success: string) => { setBusy(true); setError(''); setMessage(''); try { await work(); setMessage(success); } catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했습니다.'); } finally { setBusy(false); } };
  const saveProfile = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next = { ...user, name: String(form.get('name') || ''), department: String(form.get('department') || ''), studentId: String(form.get('student_number') || ''), birth: String(form.get('birth_date') || ''), self_intro: String(form.get('self_intro') || '') };
    run(async () => { await api(`/api/user/${user.id}`, { method: 'PUT', body: JSON.stringify({ name: next.name, department: next.department, student_number: next.studentId, birth_date: next.birth || null, self_intro: next.self_intro }) }); updateUser(next); }, '개인정보를 저장했습니다.');
  };
  const uploadProfile = (file?: File) => {
    if (!file) return;
    const data = new FormData();
    data.append('image', file);
    run(async () => {
      await api(`/api/upload/profile/${user.id}`, { method: 'POST', body: data });
      await refreshUser();
    }, '프로필 사진을 변경했습니다.');
  };
  const changePassword = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const nextPassword = String(form.get('new_password') || ''); if (nextPassword !== form.get('confirm_password')) return setError('새 비밀번호 확인이 일치하지 않습니다.'); run(() => api(`/api/user/${user.id}/password`, { method: 'PUT', body: JSON.stringify({ current_password: form.get('current_password'), new_password: nextPassword }) }), '비밀번호를 변경했습니다.'); event.currentTarget.reset(); };
  const togglePreference = (key: string) => { const next = { ...preferences, [key]: !preferences[key] }; setPreferences(next); localStorage.setItem('kkiri_notification_preferences', JSON.stringify(next)); };
  const deleteAccount = async () => { if (!window.confirm('회원 탈퇴 시 모든 계정 데이터를 되돌릴 수 없습니다. 계속할까요?')) return; if (!window.confirm('정말 탈퇴할까요?')) return; await run(() => api(`/api/delete-user/${user.id}`, { method: 'DELETE' }), '회원 탈퇴가 완료되었습니다.'); logout(); };

  return <><PageTitle eyebrow="ACCOUNT SETTINGS" title="계정 및 개인정보" description="프로필, 비밀번호, 알림 환경을 관리하세요." />{message && <div className="form-success"><CheckCircle2 />{message}</div>}{error && <div className="form-error">{error}</div>}
    <div className="settings-layout"><form className="content-card feature-form" onSubmit={saveProfile}><div className="feature-card-title"><Settings /><div><h2>개인정보</h2><p>서비스에서 사용하는 기본 정보입니다.</p></div></div><div className="account-profile-upload"><UserAvatar user={user} className="account-profile-preview" /><div><strong>프로필 사진</strong><p>JPG, PNG, WEBP 이미지로 변경할 수 있습니다.</p><label className="ghost-button"><ImagePlus /> 사진 변경<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { uploadProfile(event.target.files?.[0]); event.target.value = ''; }} /></label></div></div><div className="form-grid two"><label>이메일<input value={user.email} disabled /></label><label>이름<input name="name" defaultValue={user.name} required /></label><label>학과<input name="department" defaultValue={user.department} /></label><label>학번<input name="student_number" defaultValue={user.studentId} /></label><label>생년월일<input name="birth_date" type="date" defaultValue={user.birth?.slice(0, 10)} /></label><label className="wide">한 줄 소개<textarea name="self_intro" rows={3} defaultValue={user.self_intro} /></label></div><button className="primary-button submit-wide" disabled={busy}><Save /> 개인정보 저장</button></form>
      <div className="settings-side"><form className="content-card feature-form" onSubmit={changePassword}><h2>비밀번호 변경</h2><label>현재 비밀번호<input name="current_password" type="password" required /></label><label>새 비밀번호<input name="new_password" type="password" minLength={4} required /></label><label>새 비밀번호 확인<input name="confirm_password" type="password" minLength={4} required /></label><button className="primary-button submit-wide" disabled={busy}>변경하기</button></form>
        <section className="content-card"><h2>알림 설정</h2><div className="toggle-list">{[['matching','팀/팀원 매칭'],['activity','활동 게시글'],['todo','활동 할 일'],['notice','공지사항']].map(([key,label]) => <button className={preferences[key] ? 'active' : ''} onClick={() => togglePreference(key)} key={key}><span>{label}</span><i /></button>)}</div></section>
        <section className="content-card danger-zone"><h2>회원 탈퇴</h2><p>계정과 활동 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p><button onClick={deleteAccount} disabled={busy}>회원 탈퇴</button></section>
      </div></div>
  </>;
}

export function ActivityArchivePage() {
  const { user } = useAuth();
  const result = useAsync(() => user ? api<PastActivity[]>(`/users/${user.id}/past-activities`) : Promise.resolve([]), [user?.id]);
  return <><PageTitle eyebrow="ACTIVITY ARCHIVE" title="지난 활동" description="완료한 경험을 미니포트폴리오로 다시 꺼내보세요." /><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '아직 완료된 활동이 없습니다.' : undefined} /><div className="archive-grid">{result.data?.map((item) => <Link className="archive-card" to={`/mypage/archive/${item.portfolio_id}`} key={item.portfolio_id}><div className="archive-top"><span>{item.activity_type || '팀 활동'}</span><small>{item.archived_at?.slice(0, 10)} 저장</small></div><h3>{item.activity_name}</h3><p>{item.role || '역할 미정'} · {item.period || '기간 미정'}</p><div><CheckCircle2 /> 완료 작업 {item.completed_task_count || 0}개 <em>포트폴리오 보기</em></div></Link>)}</div></>;
}

export function PortfolioPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const result = useAsync(() => user ? api<Portfolio>(`/users/${user.id}/past-activities/${id}`) : Promise.reject(new Error('로그인이 필요합니다.')), [id, user?.id]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<string[]>([]);
  useEffect(() => { if (result.data) setImages(result.data.image_urls || []); }, [result.data]);

  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!user) return; const form = new FormData(event.currentTarget); const links = String(form.get('links') || '').split('\n').map((line) => { const [title, ...url] = line.split('|'); return { title: title.trim(), url: url.join('|').trim() }; }).filter((link) => /^https?:\/\//i.test(link.url)); setBusy(true); setMessage(''); try { await api(`/users/${user.id}/past-activities/${id}`, { method: 'PUT', body: JSON.stringify({ title: form.get('title'), activity_type: form.get('activity_type'), role: form.get('role'), summary: form.get('summary'), achievements: String(form.get('achievements') || '').split('\n').map((item) => item.trim()).filter(Boolean), reflection: form.get('reflection'), image_urls: images, links }) }); await result.reload(); setEditing(false); setMessage('포트폴리오를 저장했습니다.'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '저장하지 못했습니다.'); } finally { setBusy(false); } };
  const upload = async (file?: File) => { if (!file || !user) return; const data = new FormData(); data.append('image', file); setBusy(true); try { const uploaded = await api<{ imageUrl: string }>(`/users/${user.id}/past-activities/${id}/images`, { method: 'POST', body: data }); setImages((current) => [...current, uploaded.imageUrl].slice(0, 6)); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '이미지를 업로드하지 못했습니다.'); } finally { setBusy(false); } };
  const download = async () => { if (!user) return; setBusy(true); try { const token = localStorage.getItem('kkiri_token'); const response = await fetch(`${API_BASE_URL}/users/${user.id}/past-activities/${id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) throw new Error('PDF를 만들지 못했습니다.'); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kkiri-mini-portfolio-${id}.pdf`; anchor.click(); URL.revokeObjectURL(url); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'PDF를 내려받지 못했습니다.'); } finally { setBusy(false); } };
  if (result.loading || result.error || !result.data) return <PageState loading={result.loading} error={result.error} />;
  const portfolio = result.data;
  const sections = [['monthly','월간 목표'],['weekly','주간 목표'],['daily','일일 목표'],['overall','기타 완료 작업']] as const;
  return <><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> 지난 활동</button>{message && <div className="inline-message">{message}</div>}
    {!editing ? <article className="portfolio-sheet"><header><span className="eyebrow">MINI PORTFOLIO</span><h1>{portfolio.activity_name}</h1><p>{portfolio.activity_type || '팀 활동'} · {portfolio.role || '역할 미정'} · {portfolio.period}</p><div className="portfolio-actions"><button className="ghost-button" onClick={() => setEditing(true)}><Edit3 /> 편집</button><button className="primary-button" disabled={busy} onClick={download}><Download /> PDF</button></div></header><section className="portfolio-summary"><strong>{portfolio.summary || '활동 요약을 작성해보세요.'}</strong><span>함께한 인원 {portfolio.member_count || 1}명 · 완료 작업 {portfolio.completed_task_count || 0}개</span></section>{portfolio.image_urls?.length ? <div className="portfolio-images">{portfolio.image_urls.map((item) => <img src={resolveApiMediaUrl(item)} alt="활동 기록" key={item} />)}</div> : null}<div className="portfolio-columns"><section><h2>핵심 성과</h2>{portfolio.achievements?.length ? <ul>{portfolio.achievements.map((item) => <li key={item}>{item}</li>)}</ul> : <p>기록된 성과가 없습니다.</p>}</section><section><h2>활동 회고</h2><p>{portfolio.reflection || '기록된 회고가 없습니다.'}</p></section></div><div className="portfolio-task-grid">{sections.map(([key, title]) => (portfolio.completed_tasks[key] || []).length ? <section key={key}><h3>{title}<span>{portfolio.completed_tasks[key].length}</span></h3>{portfolio.completed_tasks[key].map((todo) => <p key={todo.todo_id}><CheckCircle2 />{todo.title}</p>)}</section> : null)}</div>{portfolio.links?.length ? <section className="portfolio-links"><h2>관련 링크</h2>{portfolio.links.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>{link.title || link.url}<ExternalLink /></a>)}</section> : null}</article>
      : <form className="content-card feature-form portfolio-editor" onSubmit={save}><PageTitle eyebrow="EDIT PORTFOLIO" title="포트폴리오 편집" description="자동 정리된 기록을 나만의 문장으로 다듬어보세요." /><div className="form-grid two"><label className="wide">활동 제목<input name="title" defaultValue={portfolio.activity_name} required /></label><label>활동 유형<input name="activity_type" defaultValue={portfolio.activity_type} /></label><label>맡은 역할<input name="role" defaultValue={portfolio.role} /></label><label className="wide">활동 요약<textarea name="summary" rows={4} defaultValue={portfolio.summary} /></label><label className="wide">핵심 성과 (한 줄에 하나)<textarea name="achievements" rows={5} defaultValue={portfolio.achievements?.join('\n')} /></label><label className="wide">활동 회고<textarea name="reflection" rows={5} defaultValue={portfolio.reflection} /></label><label className="wide">관련 링크 (이름 | URL)<textarea name="links" rows={4} defaultValue={portfolio.links?.map((link) => `${link.title || '관련 링크'} | ${link.url}`).join('\n')} /></label></div><div className="portfolio-upload"><div className="portfolio-images">{images.map((item) => <button type="button" title="이미지 제거" onClick={() => setImages((current) => current.filter((image) => image !== item))} key={item}><img src={resolveApiMediaUrl(item)} alt="활동 기록" /></button>)}</div>{images.length < 6 && <label><ImagePlus /> 사진 추가<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => upload(event.target.files?.[0])} /></label>}</div><div className="button-row"><button type="button" className="ghost-button" onClick={() => setEditing(false)}>취소</button><button className="primary-button" disabled={busy}><Save /> 저장</button></div></form>}
  </>;
}

export function AwardsPage() {
  const { user } = useAuth();
  const result = useAsync(() => user ? api<{ items: AwardItem[]; summary: { award_count: number; total_net_prize: number } }>(`/users/${user.id}/awards`) : Promise.reject(new Error('로그인이 필요합니다.')), [user?.id]);
  const [message, setMessage] = useState('');
  const save = async (event: FormEvent<HTMLFormElement>, item: AwardItem) => { event.preventDefault(); if (!user) return; const form = new FormData(event.currentTarget); try { await api(`/users/${user.id}/awards/${item.portfolio_id}`, { method: 'PUT', body: JSON.stringify({ ...item, is_awarded: form.get('is_awarded') === 'on', award_title: form.get('award_title'), has_prize: form.get('has_prize') === 'on', prize_amount: Number(form.get('prize_amount') || 0), tax_applied: form.get('tax_applied') === 'on' }) }); setMessage('수상 내역을 저장했습니다.'); await result.reload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '저장하지 못했습니다.'); } };
  const summary = result.data?.summary;
  return <><PageTitle eyebrow="AWARDS" title="수상 내역" description="완료한 활동의 수상 경험과 상금을 정리하세요." />{summary && <div className="award-summary"><div><Trophy /><span><strong>{summary.award_count}</strong>수상 활동</span></div><div><Award /><span><strong>{Math.round(summary.total_net_prize).toLocaleString()}원</strong>예상 실수령 상금</span></div></div>}{message && <div className="inline-message">{message}</div>}<PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.items.length ? '정리할 완료 활동이 없습니다.' : undefined} /><div className="award-list">{result.data?.items.map((item) => <form className="content-card award-form" onSubmit={(event) => save(event, item)} key={item.portfolio_id}><div><span className="source-pill enterprise">{item.activity_type || '팀 활동'}</span><h3>{item.activity_name}</h3><p>{item.period}</p></div><label className="check-label"><input type="checkbox" name="is_awarded" defaultChecked={item.is_awarded} /> 수상했어요</label><label>수상명<input name="award_title" defaultValue={item.award_title || ''} /></label><div className="award-money"><label className="check-label"><input type="checkbox" name="has_prize" defaultChecked={item.has_prize} /> 상금 있음</label><label>상금<input name="prize_amount" type="number" min={0} defaultValue={item.prize_amount || 0} /></label><label className="check-label"><input type="checkbox" name="tax_applied" defaultChecked={item.tax_applied} /> 22% 원천징수</label></div><button className="ghost-button"><Save /> 저장</button></form>)}</div></>;
}

type Feedback = { feedback_id: number; category: string; content: string; status: string; created_at: string; replies?: Array<{ reply_id: number; content: string; created_at: string }> };
export function FeedbackPage() {
  const result = useAsync(() => api<Feedback[]>('/api/developer-feedback/mine'), []);
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api('/api/developer-feedback', { method: 'POST', body: JSON.stringify({ category: form.get('category'), content: form.get('content'), platform: 'web' }) }); event.currentTarget.reset(); setMessage('의견을 전달했습니다. 감사합니다.'); await result.reload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '의견을 보내지 못했습니다.'); } };
  return <><PageTitle eyebrow="FEEDBACK" title="개발자에게 한마디" description="불편한 점이나 필요한 기능을 알려주세요." /><div className="detail-grid"><form className="content-card feature-form" onSubmit={submit}><div className="feature-card-title"><MessageSquareText /><div><h2>의견 보내기</h2><p>10자 이상 자세히 적어주시면 빠르게 확인할 수 있어요.</p></div></div><label>분류<select name="category"><option value="IMPROVEMENT">개선사항</option><option value="BUG">오류 제보</option><option value="OTHER">기타</option></select></label><label>내용<textarea name="content" minLength={10} maxLength={2000} rows={12} required /></label>{message && <div className="inline-message">{message}</div>}<button className="primary-button submit-wide">개발자에게 전달</button></form><section className="content-card"><h2>최근 전달 내역</h2><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '전달한 의견이 없습니다.' : undefined} /><div className="feedback-history">{result.data?.map((item) => <article key={item.feedback_id}><div><strong>{item.category === 'BUG' ? '오류 제보' : item.category === 'IMPROVEMENT' ? '개선사항' : '기타'}</strong><span>{item.created_at.slice(0, 10)} · {item.status}</span></div><p>{item.content}</p>{item.replies?.map((reply) => <blockquote key={reply.reply_id}><strong>개발자 답장</strong><p>{reply.content}</p></blockquote>)}</article>)}</div></section></div></>;
}
