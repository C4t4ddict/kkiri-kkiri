/* eslint-disable no-alert */
import { FormEvent, useState } from 'react';
import { ArrowLeft, CalendarDays, Edit3, Send, Trash2, UsersRound } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, ApplicationTemplate, Recruitment, User } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type RecruitmentApplication = {
  application_id: number;
  applicant_id: number;
  memo: string;
  status: string;
  offer_id?: number | null;
  offer_status?: string | null;
  applicant?: User;
};

const today = () => new Date().toISOString().slice(0, 10);

export function RecruitmentEditorPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const activities = useAsync(async () => {
    const response = await api<ActivityItem[] | { items: ActivityItem[] }>('/api/activities/open?page=1&limit=100');
    return Array.isArray(response) ? response : response.items;
  }, []);
  const detail = useAsync(() => id ? api<Recruitment>(`/api/team-recruitments/${id}`) : Promise.resolve(null), [id]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(editing ? `/api/team-recruitments/${id}` : '/api/team-recruitments', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          activity_id: Number(form.get('activity_id')),
          post_name: form.get('post_name'),
          activity_type: form.get('activity_type'),
          qualification_department: form.get('qualification_department'),
          required_members: Number(form.get('required_members')),
          activity_start_date: form.get('activity_start_date'),
          activity_end_date: form.get('activity_end_date'),
          meeting_type: form.get('meeting_type'),
          recruitment_scope: form.get('recruitment_scope'),
          memo: form.get('memo'),
        }),
      });
      navigate('/matching/mine');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '모집글을 저장하지 못했습니다.'); }
    finally { setSaving(false); }
  };

  if (editing && (detail.loading || detail.error || !detail.data)) return <PageState loading={detail.loading} error={detail.error} />;
  const current = detail.data;
  return <>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> 돌아가기</button>
    <PageTitle title={editing ? '모집글 수정' : '새 팀 모집'} description="진행 중인 활동을 고르고 함께할 팀원의 조건을 알려주세요." />
    <form className="content-card feature-form" onSubmit={submit}>
      <div className="form-grid two">
        <label className="wide">모집글 제목<input name="post_name" defaultValue={current?.post_name} maxLength={120} required /></label>
        <label className="wide">활동 선택<select name="activity_id" defaultValue={current?.activity_id} required><option value="">모집 중인 활동을 선택하세요</option>{activities.data?.map((item) => <option value={item.activity_id} key={item.activity_id}>{item.title}</option>)}</select></label>
        <label>카테고리<select name="activity_type" defaultValue={current?.activity_type || '공모전'}><option>공모전</option><option>대외활동</option><option>프로젝트</option><option>스터디</option><option>기업 커리큘럼</option><option>기타</option></select></label>
        <label>모집 학과<input name="qualification_department" defaultValue={current?.qualification_department || '전학과'} required /></label>
        <label>필요 인원<input name="required_members" type="number" min={2} max={99} defaultValue={current?.required_members || 4} required /></label>
        <label>모임 방식<select name="meeting_type" defaultValue={current?.meeting_type || '대면'}><option>대면</option><option>비대면</option><option>혼합</option></select></label>
        <label>시작일<input name="activity_start_date" type="date" defaultValue={current?.activity_start_date || today()} required /></label>
        <label>종료일<input name="activity_end_date" type="date" defaultValue={current?.activity_end_date || today()} required /></label>
        <label className="wide">공개 범위<select name="recruitment_scope" defaultValue={current?.recruitment_scope || 'NATIONWIDE'}><option value="NATIONWIDE">전국 공개</option><option value="SCHOOL">인증된 본교 학생만</option></select></label>
        <label className="wide">자격 조건·소개<textarea name="memo" rows={7} maxLength={2000} defaultValue={current?.memo || ''} placeholder="찾는 팀원, 진행 방식, 목표를 구체적으로 적어주세요." /></label>
      </div>
      {error && <div className="form-error">{error}</div>}<button className="primary-button submit-wide" disabled={saving}>{saving ? '저장 중…' : editing ? '수정 완료' : '모집 시작'}</button>
    </form>
  </>;
}

export function MatchingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const result = useAsync(async () => {
    const recruitment = await api<Recruitment>(`/api/team-recruitments/${id}`);
    const [ownerResult, applicationList, templateList] = await Promise.all([
      api<{ user: User }>(`/api/user/${recruitment.owner_user_id}`),
      api<RecruitmentApplication[]>(`/api/team-recruitments/${id}/applications`),
      Number(recruitment.owner_user_id) === Number(user?.id) ? Promise.resolve([]) : api<ApplicationTemplate[]>('/api/application-templates'),
    ]);
    const applications = Number(recruitment.owner_user_id) === Number(user?.id)
      ? await Promise.all(applicationList.map(async (application) => {
        const profile = await api<{ user: User }>(`/api/user/${application.applicant_id}`).catch(() => null);
        return { ...application, applicant: profile?.user };
      }))
      : applicationList;
    return { recruitment, owner: ownerResult.user, applications, templates: templateList };
  }, [id, user?.id]);
  const [intro, setIntro] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const act = async (work: () => Promise<void>, success: string) => {
    setBusy(true); setMessage('');
    try { await work(); setMessage(success); await result.reload(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  if (result.loading || result.error || !result.data) return <PageState loading={result.loading} error={result.error} />;
  const { recruitment, owner, applications, templates } = result.data;
  const mine = applications.find((application) => Number(application.applicant_id) === Number(user?.id));
  const ownerView = Number(recruitment.owner_user_id) === Number(user?.id);
  const selectTemplate = (value: string) => { setTemplateId(value); const template = templates.find((item) => String(item.template_id) === value); if (template) setIntro(template.content); };

  return <>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> 팀 매칭</button>
    <section className="recruitment-detail-hero"><div className="card-tags"><span>{recruitment.activity_type || '팀 활동'}</span><span>{recruitment.meeting_type || '방식 협의'}</span><span>{recruitment.recruitment_scope === 'SCHOOL' ? '본교 공개' : '전국 공개'}</span></div><h1>{recruitment.post_name}</h1><p>{recruitment.activity_name}</p><div className="recruitment-facts"><span><UsersRound /> {recruitment.required_members || '-'}명 모집</span><span><CalendarDays /> {recruitment.activity_period || '기간 협의'}</span></div></section>
    {message && <div className="inline-message">{message}</div>}
    <div className="detail-grid matching-detail-grid"><section className="content-card"><h2>모집 안내</h2><p className="long-copy">{recruitment.memo || '작성된 추가 안내가 없습니다.'}</p><div className="owner-profile"><span>{owner.name?.slice(0, 1)}</span><div><strong>{owner.name}</strong><small>{owner.department || '학과 미등록'} · 모집글 작성자</small></div></div>{ownerView && <div className="button-row"><Link className="ghost-button" to={`/matching/${id}/edit`}><Edit3 /> 수정</Link><button className="danger-inline" disabled={busy} onClick={() => { if (window.confirm('이 모집글을 삭제할까요?')) act(async () => { await api(`/api/team-recruitments/${id}`, { method: 'DELETE' }); navigate('/matching/mine'); }, '삭제했습니다.'); }}><Trash2 /> 삭제</button></div>}</section>
      <section className="content-card">{ownerView ? <><h2>지원자 {applications.length}명</h2><div className="applicant-list">{applications.length ? applications.map((application) => <article key={application.application_id}><div className="applicant-head"><span>{application.applicant?.name?.slice(0, 1) || '?'}</span><div><strong>{application.applicant?.name || '지원자'}</strong><small>{application.applicant?.department || '학과 미등록'} · {application.status}</small></div></div><p>{application.memo}</p>{application.status === 'PENDING' && !application.offer_id && <button className="primary-button compact" disabled={busy} onClick={() => act(() => api(`/api/team-recruitments/${id}/applications/${application.application_id}/invite`, { method: 'POST' }), '합류 제안을 보냈습니다.')}>합류 제안 보내기</button>}{application.offer_id && <em>합류 제안 {application.offer_status === 'PENDING' ? '응답 대기 중' : '처리 완료'}</em>}</article>) : <div className="goal-empty">아직 지원자가 없습니다.</div>}</div></> : <><h2>팀에 지원하기</h2>{mine ? <div className="applied-state"><Send /><strong>이미 지원한 모집글입니다</strong><p>현재 상태: {mine.status}</p>{mine.status === 'PENDING' && <button className="danger-button" disabled={busy} onClick={() => act(() => api(`/api/applications/${mine.application_id}/cancel`, { method: 'PUT' }), '지원을 취소했습니다.')}>지원 취소</button>}</div> : <form className="stack-form" onSubmit={(event) => { event.preventDefault(); act(() => api('/api/applications', { method: 'POST', body: JSON.stringify({ recruitment_id: Number(id), template_id: templateId || null, memo: intro }) }), '지원이 접수되었습니다.'); }}><label>지원서 템플릿<select value={templateId} onChange={(event) => selectTemplate(event.target.value)}><option value="">직접 작성</option>{templates.map((template) => <option value={template.template_id} key={template.template_id}>{template.title}</option>)}</select></label><label>지원 내용<textarea rows={10} maxLength={2000} value={intro} onChange={(event) => setIntro(event.target.value)} required /></label><button className="primary-button" disabled={busy || !intro.trim()}>지원하기</button></form>}</>}</section>
    </div>
  </>;
}

export function MyRecruitmentsPage() {
  const result = useAsync(() => api<Recruitment[]>('/api/my-recruitments'), []);
  const remove = async (id: number) => { if (!window.confirm('이 모집글을 삭제할까요?')) return; await api(`/api/team-recruitments/${id}`, { method: 'DELETE' }); await result.reload(); };
  return <><div className="title-actions"><PageTitle title="내가 작성한 모집글" description="지원자를 확인하고 모집 조건을 관리하세요." /><Link className="primary-button compact" to="/matching/new">새 모집글</Link></div><PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '작성한 모집글이 없습니다.' : undefined} /><div className="recruitment-list">{result.data?.map((item) => <article className="management-row" key={item.recruitment_id}><Link to={`/matching/${item.recruitment_id}`}><div className="card-tags"><span>{item.status || 'OPEN'}</span><span>지원 {item.application_count || 0}명</span></div><h3>{item.post_name}</h3><p>{item.activity_name} · {item.activity_period}</p></Link><div className="row-actions">{Boolean(item.can_edit) && <Link to={`/matching/${item.recruitment_id}/edit`}><Edit3 /> 수정</Link>}<button onClick={() => remove(item.recruitment_id)}><Trash2 /> 삭제</button></div></article>)}</div></>;
}
