import { FormEvent, useState } from 'react';
import { Bot, Eye, EyeOff, ImageOff, MessageSquareText, RefreshCw } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { resolveApiMediaUrl } from '../shared/api/media';
import { useAsync } from '../shared/hooks/useAsync';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type Overview = { counts: { total_activities?: number; missing_image_count?: number; duplicate_group_count?: number; hidden_count?: number }; crawlerRunning: boolean };
type AdminActivity = { activity_id: number; title: string; organizer?: string; main_image_url?: string; quality_score?: number; is_hidden: number };
type AdminFeedback = { feedback_id: number; user_name: string; user_email: string; category: string; content: string; status: string; created_at: string; replies?: Array<{ reply_id: number; content: string }> };

export function AdminOperationsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<'activities' | 'feedback'>('activities');
  const [message, setMessage] = useState('');
  const overview = useAsync(() => api<Overview>('/api/admin/overview'), []);
  const activities = useAsync(() => api<AdminActivity[]>('/api/admin/activities?quality=all&search='), []);
  const feedback = useAsync(() => api<AdminFeedback[]>('/api/admin/developer-feedback'), []);
  if (!user?.is_admin) return <PageState error="운영자 권한이 필요합니다." />;

  const runCrawler = async () => { setMessage(''); try { const result = await api<{ message: string }>('/api/admin/crawler/run', { method: 'POST' }); setMessage(result.message); await overview.reload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '수집을 시작하지 못했습니다.'); } };
  const toggle = async (item: AdminActivity) => { await api(`/api/admin/activities/${item.activity_id}`, { method: 'PUT', body: JSON.stringify({ is_hidden: item.is_hidden ? 0 : 1 }) }); await Promise.all([activities.reload(), overview.reload()]); };
  const reply = async (event: FormEvent<HTMLFormElement>, id: number) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api(`/api/admin/developer-feedback/${id}/replies`, { method: 'POST', body: JSON.stringify({ content: form.get('content') }) }); event.currentTarget.reset(); setMessage('사용자에게 답장을 보냈습니다.'); await feedback.reload(); };
  const counts = overview.data?.counts;
  return <><div className="title-actions"><PageTitle eyebrow="OPERATIONS" title="서비스 운영" description="활동 데이터 품질과 사용자 의견을 관리하세요." /><button className="primary-button compact" onClick={runCrawler} disabled={overview.data?.crawlerRunning}><RefreshCw /> {overview.data?.crawlerRunning ? '수집 중' : '활동 수집'}</button></div>{message && <div className="inline-message">{message}</div>}
    <div className="admin-counts"><div><Bot /><strong>{counts?.total_activities || 0}</strong><span>전체 활동</span></div><div><ImageOff /><strong>{counts?.missing_image_count || 0}</strong><span>이미지 누락</span></div><div><EyeOff /><strong>{counts?.hidden_count || 0}</strong><span>숨김 활동</span></div><div><MessageSquareText /><strong>{feedback.data?.length || 0}</strong><span>사용자 의견</span></div></div>
    <div className="segment-tabs"><button className={section === 'activities' ? 'active' : ''} onClick={() => setSection('activities')}>활동 관리</button><button className={section === 'feedback' ? 'active' : ''} onClick={() => setSection('feedback')}>사용자 의견</button></div>
    {section === 'activities' ? <><PageState loading={activities.loading} error={activities.error} /><div className="admin-activity-list">{activities.data?.map((item) => <article key={item.activity_id}><span className="admin-thumb">{item.main_image_url ? <img src={resolveApiMediaUrl(item.main_image_url)} alt="" /> : <ImageOff />}</span><div><strong>{item.title}</strong><small>{item.organizer || '주최기관 미등록'} · 품질 {item.quality_score ?? '-'}점</small></div><button onClick={() => toggle(item)}>{item.is_hidden ? <Eye /> : <EyeOff />}{item.is_hidden ? '공개' : '숨김'}</button></article>)}</div></> : <><PageState loading={feedback.loading} error={feedback.error} empty={!feedback.loading && !feedback.data?.length ? '사용자 의견이 없습니다.' : undefined} /><div className="admin-feedback-list">{feedback.data?.map((item) => <article className="content-card" key={item.feedback_id}><header><div><strong>{item.user_name}</strong><span>{item.user_email}</span></div><em>{item.category} · {item.status}</em></header><p>{item.content}</p>{item.replies?.map((answer) => <blockquote key={answer.reply_id}>{answer.content}</blockquote>)}<form onSubmit={(event) => reply(event, item.feedback_id)}><input name="content" placeholder="답장을 입력하세요" required /><button>답장 보내기</button></form></article>)}</div></>}
  </>;
}
