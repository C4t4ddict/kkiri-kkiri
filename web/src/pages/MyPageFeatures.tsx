import {
  ArrowLeft,
  Award,
  Check,
  Copy,
  Heart,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundPen,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { ActivityCard } from '../features/activities/ActivityCard';
import { api } from '../shared/api/client';
import type { ActivityItem, User } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

function BackToMyPage() {
  return <Link className="back-link" to="/mypage"><ArrowLeft size={16} /> 마이페이지</Link>;
}

function ErrorNotice({ message }: { message: string }) {
  return message ? <p className="form-error">{message}</p> : null;
}

export function FavoriteActivitiesPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    api<ActivityItem[]>('/api/favorite-activities')
      .then(setItems)
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (activityId: number) => {
    await api(`/api/favorite-activities/${activityId}`, { method: 'DELETE' });
    setItems((current) => current.filter((item) => item.activity_id !== activityId));
  };
  return <>
    <BackToMyPage />
    <PageTitle eyebrow="FAVORITES" title="관심 활동" description="저장해둔 활동을 한곳에서 확인하세요." />
    <PageState loading={loading} error={error} empty={!loading && !items.length ? '저장한 관심 활동이 없습니다.' : undefined} />
    <div className="activity-grid">{items.map((item) => <div className="favorite-card-wrap" key={item.activity_id}><ActivityCard item={item} /><button className="favorite-remove" aria-label="관심 활동 삭제" onClick={() => remove(item.activity_id)}><Heart size={17} fill="currentColor" /></button></div>)}</div>
  </>;
}

type Recruitment = {
  recruitment_id: number;
  post_name: string;
  activity_name?: string;
  activity_type?: string;
  meeting_type?: string;
  activity_period?: string;
  status: string;
  application_count: number;
  can_edit: number | boolean;
};

export function MyRecruitmentsPage() {
  const [items, setItems] = useState<Recruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Recruitment | null>(null);
  const load = useCallback(() => api<Recruitment[]>('/api/my-recruitments')
    .then(setItems)
    .catch((loadError) => setError(loadError.message))
    .finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (item: Recruitment) => {
    try {
      await api(`/api/team-recruitments/${item.recruitment_id}`, { method: 'DELETE' });
      setItems((current) => current.filter((value) => value.recruitment_id !== item.recruitment_id));
      setPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '모집글을 삭제하지 못했습니다.');
    }
  };
  return <>
    <BackToMyPage />
    <PageTitle eyebrow="RECRUITING" title="나의 모집" description="직접 작성한 모집글과 지원 현황을 관리하세요." />
    <PageState loading={loading} error={error} empty={!loading && !items.length ? '작성한 모집글이 없습니다.' : undefined} />
    <div className="manage-list">{items.map((item) => <article className="manage-card" key={item.recruitment_id}>
      <div className="manage-status">{item.status === 'OPEN' ? '모집 중' : '모집 완료'}</div>
      <div className="manage-copy"><h3>{item.post_name}</h3><p>{[item.activity_name, item.activity_type, item.meeting_type, item.activity_period].filter(Boolean).join(' · ')}</p><small>지원 {item.application_count || 0}명 · {item.can_edit ? '수정 가능' : '수정 불가'}</small></div>
      <button className="icon-danger" aria-label="모집글 삭제" onClick={() => setPendingDelete(item)}><Trash2 size={18} /></button>
    </article>)}</div>
    {pendingDelete ? <div className="modal-backdrop"><div className="web-modal"><div className="modal-head"><h2>모집글 삭제</h2><button onClick={() => setPendingDelete(null)}>×</button></div><p>“{pendingDelete.post_name}” 모집글을 삭제할까요?</p><div className="button-row"><button className="ghost-button" onClick={() => setPendingDelete(null)}>취소</button><button className="danger-button modal-danger" onClick={() => remove(pendingDelete)}>삭제</button></div></div></div> : null}
  </>;
}

type AwardItem = {
  portfolio_id: number;
  activity_name: string;
  activity_type?: string;
  is_awarded: boolean;
  award_title?: string | null;
  has_prize: boolean;
  prize_amount: number;
  tax_applied: boolean;
  net_prize_amount: number;
};
type AwardResponse = { summary: { award_count: number; total_net_prize: number }; items: AwardItem[] };

export function AwardsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AwardResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<number, AwardItem>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!user) return;
    api<AwardResponse>(`/users/${user.id}/awards`).then((result) => {
      setData(result);
      setDrafts(Object.fromEntries(result.items.map((item) => [item.portfolio_id, item])));
    }).catch((loadError) => setError(loadError.message));
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const patchDraft = (id: number, patch: Partial<AwardItem>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const save = async (id: number) => {
    if (!user) return;
    try {
      const result = await api<AwardResponse>(`/users/${user.id}/awards/${id}`, { method: 'PUT', body: JSON.stringify(drafts[id]) });
      setData(result);
      setDrafts(Object.fromEntries(result.items.map((item) => [item.portfolio_id, item])));
      setOpenId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '수상내역을 저장하지 못했습니다.');
    }
  };
  return <>
    <BackToMyPage />
    <PageTitle eyebrow="AWARDS" title="수상내역" description="수상 횟수와 실제 받은 상금을 정리하세요." />
    <div className="award-summary"><div><Award /><span>수상 횟수</span><strong>{data?.summary.award_count || 0}회</strong></div><div><span>실수령 총액</span><strong>{(data?.summary.total_net_prize || 0).toLocaleString()}원</strong></div></div>
    <PageState loading={!data && !error} error={error} empty={data && !data.items.length ? '정리할 지난 활동이 없습니다.' : undefined} />
    <div className="award-list">{data?.items.map((item) => {
      const draft = drafts[item.portfolio_id] || item;
      const open = openId === item.portfolio_id;
      return <article className={`award-card ${item.is_awarded ? 'completed' : ''}`} key={item.portfolio_id}>
        <button className="award-toggle" onClick={() => setOpenId(open ? null : item.portfolio_id)}><span><strong>{item.activity_name}</strong><small>{item.activity_type || '활동'}</small></span><span>{item.is_awarded ? '작성 완료' : '작성하기'}</span></button>
        {open ? <div className="award-form">
          <label className="check-row"><input type="checkbox" checked={draft.is_awarded} onChange={(event) => patchDraft(item.portfolio_id, { is_awarded: event.target.checked })} /> 수상했어요</label>
          {draft.is_awarded ? <><label>수상명<input value={draft.award_title || ''} maxLength={120} onChange={(event) => patchDraft(item.portfolio_id, { award_title: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={draft.has_prize} onChange={(event) => patchDraft(item.portfolio_id, { has_prize: event.target.checked })} /> 상금이 있어요</label>{draft.has_prize ? <><label>상금<input inputMode="numeric" value={draft.prize_amount || ''} onChange={(event) => patchDraft(item.portfolio_id, { prize_amount: Number(event.target.value.replace(/\D/g, '')) })} /></label><label className="check-row"><input type="checkbox" checked={draft.tax_applied} onChange={(event) => patchDraft(item.portfolio_id, { tax_applied: event.target.checked })} /> 제세공과금 22% 적용</label><p className="net-prize">예상 실수령액 {(Math.round((draft.prize_amount || 0) * (draft.tax_applied ? .78 : 1))).toLocaleString()}원</p></> : null}</> : null}
          <button className="primary-button" onClick={() => save(item.portfolio_id)}>활동 내용 저장</button>
        </div> : null}
      </article>;
    })}</div>
  </>;
}

type Feedback = { feedback_id: number; category: string; content: string; status: string; created_at: string; replies: { reply_id: number; content: string; created_at: string }[] };

export function DeveloperFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [category, setCategory] = useState('IMPROVEMENT');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Feedback[]>('/api/developer-feedback/mine').then(setItems).catch((loadError) => setError(loadError.message)), []);
  useEffect(() => { load(); }, [load]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/developer-feedback', { method: 'POST', body: JSON.stringify({ category, content, platform: 'web' }) });
      setContent('');
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '의견을 전달하지 못했습니다.');
    } finally { setBusy(false); }
  };
  return <>
    <BackToMyPage />
    <PageTitle eyebrow="FEEDBACK" title="개발자에게 한마디" description="개선사항과 오류를 운영자에게 직접 전달하세요." />
    <div className="two-columns feedback-layout">
      <form className="content-card feedback-form" onSubmit={submit}><label>분류<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="IMPROVEMENT">개선사항</option><option value="BUG">오류사항</option><option value="OTHER">기타</option></select></label><label>내용<textarea rows={9} minLength={10} maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="10자 이상 자세히 적어주세요." /></label><small>{content.length}/2000</small><button className="primary-button" disabled={busy || content.trim().length < 10}>{busy ? '전달 중...' : '의견 전달'}</button><ErrorNotice message={error} /></form>
      <div className="feedback-history"><h2>전달 내역</h2>{items.map((item) => <article className="feedback-item" key={item.feedback_id}><span>{item.status === 'REPLIED' ? '답장 완료' : '접수 완료'}</span><p>{item.content}</p><small>{String(item.created_at).slice(0, 10)}</small>{item.replies.map((reply) => <div className="operator-reply" key={reply.reply_id}><strong>운영자 답장</strong><p>{reply.content}</p></div>)}</article>)}{!items.length ? <PageState empty="전달한 의견이 없습니다." /> : null}</div>
    </div>
  </>;
}

export function SchoolVerificationPage() {
  const { user, updateUser } = useAuth();
  const [email, setEmail] = useState(user?.school_email || '');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const verified = Boolean(user?.school_access_enabled || (user?.school_email_verified && user?.school_domain));
  const request = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await api<{ message: string; development_code?: string }>('/auth/school-email/request', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true); setCode(result.development_code || ''); setMessage(result.message);
    } catch (requestError) { setMessage(requestError instanceof Error ? requestError.message : '인증 코드를 보내지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await api<{ message: string; user: User }>('/auth/school-email/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
      updateUser(result.user); setMessage(result.message);
    } catch (verifyError) { setMessage(verifyError instanceof Error ? verifyError.message : '학교 인증을 완료하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <>
    <BackToMyPage />
    <PageTitle eyebrow="SCHOOL ACCESS" title="학교 이메일 인증" description="인증된 같은 학교 사용자끼리 본교 모집을 이용할 수 있어요." />
    <section className="verification-card">
      {verified ? <div className="verified-state"><Check size={32} /><div><strong>학교 인증 완료</strong><p>{user?.school_email} · {user?.school_name}</p></div></div> : <><label>학교 이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.ac.kr" /></label><button className="ghost-button" disabled={busy || !email} onClick={request}>{sent ? '인증코드 재전송' : '인증코드 전송'}</button>{sent ? <><label>6자리 인증코드<input inputMode="numeric" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label><button className="primary-button" disabled={busy || code.length !== 6} onClick={verify}>학교 인증 완료</button></> : null}</>}
      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  </>;
}

export function AccountSettingsPage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [studentId, setStudentId] = useState(user?.studentId || user?.student_number || '');
  const [birth, setBirth] = useState(user?.birth || user?.birth_date || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/user/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, department, student_number: studentId, birth_date: birth || null }),
      });
      updateUser({
        ...user,
        name: name.trim(),
        department: department.trim(),
        studentId: studentId.trim(),
        student_number: studentId.trim(),
        birth,
        birth_date: birth,
      });
      setMessage('개인정보를 저장했습니다.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '개인정보를 저장하지 못했습니다.');
    } finally { setBusy(false); }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    const categoryCount = [
      /[\p{L}]/u.test(newPassword),
      /\d/.test(newPassword),
      /[^\p{L}\p{N}\s]/u.test(newPassword),
    ].filter(Boolean).length;
    if (newPassword.length < 8 || /\s/.test(newPassword) || categoryCount < 2) {
      setError('새 비밀번호는 8자 이상이며 문자, 숫자, 특수문자 중 2종류 이상을 사용해주세요.');
      return;
    }
    if (newPassword !== passwordConfirm) return setError('새 비밀번호 확인이 일치하지 않습니다.');
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/user/${user.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword(''); setNewPassword(''); setPasswordConfirm(''); setMessage('비밀번호를 변경했습니다.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '비밀번호를 변경하지 못했습니다.');
    } finally { setBusy(false); }
  };

  return <>
    <BackToMyPage />
    <PageTitle eyebrow="ACCOUNT" title="계정 설정" description="아이디를 확인하고 개인정보와 비밀번호를 안전하게 관리하세요." />
    <div className="two-columns settings-layout">
      <form className="content-card settings-form" onSubmit={saveProfile}>
        <h2><UserRoundPen size={20} /> 개인정보 수정</h2>
        <label>아이디(이메일)<input value={user?.email || ''} readOnly /></label>
        <label>이름<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required /></label>
        <label>학과<input value={department} maxLength={120} onChange={(event) => setDepartment(event.target.value)} /></label>
        <label>학번<input value={studentId} maxLength={40} onChange={(event) => setStudentId(event.target.value)} /></label>
        <label>생년월일<input type="date" value={String(birth).slice(0, 10)} onChange={(event) => setBirth(event.target.value)} /></label>
        <button className="primary-button" disabled={busy}>개인정보 저장</button>
      </form>
      <form className="content-card settings-form" onSubmit={savePassword}>
        <h2><KeyRound size={20} /> 비밀번호 수정</h2>
        <label>현재 비밀번호<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label>새 비밀번호<input type="password" value={newPassword} maxLength={128} onChange={(event) => setNewPassword(event.target.value)} required /></label>
        <small>8자 이상 · 문자/숫자/특수문자 중 2종류 이상</small>
        <label>새 비밀번호 확인<input type="password" value={passwordConfirm} maxLength={128} onChange={(event) => setPasswordConfirm(event.target.value)} required /></label>
        <button className="ghost-button" disabled={busy}>비밀번호 변경</button>
      </form>
    </div>
    {message ? <p className="inline-message">{message}</p> : null}<ErrorNotice message={error} />
  </>;
}

type Friend = { user_id: number; name: string; profile_picture?: string | null; unread_count: number; last_message_at?: string | null };
type FriendRequest = { friendship_id: number; user_id: number; name: string; created_at: string };

export function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [myCode, setMyCode] = useState('');
  const [friendCode, setFriendCode] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [friendData, requestData] = await Promise.all([api<{ friend_code: string; friends: Friend[] }>('/api/friends'), api<FriendRequest[]>('/api/friends/requests')]);
      setFriends(friendData.friends); setMyCode(friendData.friend_code); setRequests(requestData); setMessage('');
    } catch (loadError) { setMessage(loadError instanceof Error ? loadError.message : '친구 목록을 불러오지 못했습니다.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const respond = async (id: number, decision: 'ACCEPTED' | 'REJECTED') => { await api(`/api/friends/requests/${id}`, { method: 'PUT', body: JSON.stringify({ decision }) }); await load(); };
  const add = async () => {
    try { const result = await api<{ friend_name: string }>('/api/friends/requests', { method: 'POST', body: JSON.stringify({ friend_code: friendCode }) }); setMessage(`${result.friend_name}님에게 친구 요청을 보냈어요.`); setFriendCode(''); }
    catch (addError) { setMessage(addError instanceof Error ? addError.message : '친구 요청을 보내지 못했습니다.'); }
  };
  const filtered = useMemo(() => friends.filter((friend) => friend.name.toLowerCase().includes(search.trim().toLowerCase())), [friends, search]);
  return <>
    <BackToMyPage />
    <PageTitle eyebrow="FRIENDS" title="친구" description="친구 코드로 연결하고 200자 이내 쪽지를 주고받으세요." />
    <section className="friend-code-panel"><div><span>내 친구 코드</span><strong>{myCode || '불러오는 중'}</strong></div><button onClick={() => navigator.clipboard.writeText(myCode)}><Copy size={18} /> 복사</button><div className="friend-add"><input value={friendCode} maxLength={10} onChange={(event) => setFriendCode(event.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="친구 코드 입력" /><button className="primary-button" disabled={!friendCode} onClick={add}><UserPlus size={16} /> 친구 요청</button></div></section>
    {requests.length ? <section><h2 className="subheading">받은 요청 {requests.length}</h2><div className="request-list">{requests.map((request) => <div className="request-row" key={request.friendship_id}><div className="small-avatar">{request.name.slice(0, 1)}</div><strong>{request.name}</strong><button onClick={() => respond(request.friendship_id, 'REJECTED')}>거절</button><button className="accept" onClick={() => respond(request.friendship_id, 'ACCEPTED')}>수락</button></div>)}</div></section> : null}
    <div className="search-field friend-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="친구 이름 검색" /></div>
    <div className="friend-list">{filtered.map((friend) => <Link className="friend-row" to={`/mypage/friends/${friend.user_id}`} key={friend.user_id}><div className="friend-avatar">{friend.name.slice(0, 1)}{friend.unread_count ? <span>{Math.min(99, friend.unread_count)}</span> : null}</div><div><strong>{friend.name}</strong><small>{friend.last_message_at ? '최근 쪽지가 있어요' : '친구가 되었어요'}</small></div><Mail size={19} /></Link>)}</div>
    {!filtered.length ? <PageState empty="표시할 친구가 없습니다." /> : null}<ErrorNotice message={message} />
  </>;
}

type DirectMessage = { message_id: number; sender_id: number; content: string; created_at: string };

export function MessageThreadPage() {
  const { user } = useAuth();
  const friendUserId = Number(useParams().friendUserId);
  const [friendName, setFriendName] = useState('친구');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await api<{ friend: { name: string }; messages: DirectMessage[] }>(`/api/friends/${friendUserId}/messages`);
      setFriendName(result.friend.name); setMessages(result.messages);
      await api(`/api/friends/${friendUserId}/messages/read`, { method: 'PUT' });
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '쪽지를 불러오지 못했습니다.'); }
  }, [friendUserId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    try { await api(`/api/friends/${friendUserId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); setContent(''); await load(); }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : '쪽지를 보내지 못했습니다.'); }
  };
  return <>
    <Link className="back-link" to="/mypage/friends"><ArrowLeft size={16} /> 친구 목록</Link>
    <PageTitle eyebrow="MESSAGE" title={friendName} description="최근 쪽지 100개를 안전하게 표시합니다." />
    <section className="message-thread">{messages.map((item) => <div className={`message-row ${item.sender_id === user?.id ? 'mine' : ''}`} key={item.message_id}><div><p>{item.content}</p><small>{String(item.created_at).slice(11, 16)}</small></div></div>)}{!messages.length ? <PageState empty="첫 쪽지를 보내보세요." /> : null}</section>
    <div className="message-composer"><textarea rows={2} maxLength={200} value={content} onChange={(event) => setContent(event.target.value)} placeholder="쪽지를 입력하세요" /><span>{content.length}/200</span><button className="primary-button" disabled={!content.trim()} onClick={send}><Send size={18} /></button></div><ErrorNotice message={error} />
  </>;
}

type AdminFeedback = Feedback & { user_name: string; user_email: string; reply_count: number };
type AdminOverview = { counts: { total_activities: number; missing_image_count: number; duplicate_group_count: number; hidden_count: number }; crawlerRunning: boolean };

export function AdminPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [feedbacks, setFeedbacks] = useState<AdminFeedback[]>([]);
  const [selected, setSelected] = useState<AdminFeedback | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const [overviewData, feedbackData] = await Promise.all([api<AdminOverview>('/api/admin/overview'), api<AdminFeedback[]>('/api/admin/developer-feedback')]); setOverview(overviewData); setFeedbacks(feedbackData); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : '운영 정보를 불러오지 못했습니다.'); }
  }, []);
  useEffect(() => { if (user?.is_admin) load(); }, [load, user?.is_admin]);
  const sendReply = async () => { if (!selected) return; await api(`/api/admin/developer-feedback/${selected.feedback_id}/replies`, { method: 'POST', body: JSON.stringify({ content: reply }) }); setReply(''); setSelected(null); await load(); };
  const runCrawler = async () => { try { await api('/api/admin/crawler/run', { method: 'POST' }); await load(); } catch (runError) { setError(runError instanceof Error ? runError.message : '수집을 시작하지 못했습니다.'); } };
  if (!user?.is_admin) return <><BackToMyPage /><PageState error="운영자 권한이 필요합니다." /></>;
  return <>
    <BackToMyPage />
    <div className="title-actions"><PageTitle eyebrow="OPERATIONS" title="운영 관리" description="관리자 계정에서만 서비스 상태와 사용자 의견을 확인합니다." /><button className="primary-button compact" onClick={runCrawler}><RefreshCw size={16} /> {overview?.crawlerRunning ? '수집 중' : '지금 수집'}</button></div>
    <div className="admin-metrics"><div><strong>{overview?.counts.total_activities || 0}</strong><span>전체 활동</span></div><div><strong>{overview?.counts.missing_image_count || 0}</strong><span>이미지 누락</span></div><div><strong>{overview?.counts.duplicate_group_count || 0}</strong><span>중복 그룹</span></div><div><strong>{overview?.counts.hidden_count || 0}</strong><span>숨김</span></div></div>
    <h2 className="subheading"><ShieldCheck size={20} /> 사용자 의견</h2><div className="feedback-admin-list">{feedbacks.map((item) => <button className="feedback-admin-card" onClick={() => setSelected(item)} key={item.feedback_id}><span>{item.reply_count ? '답장 완료' : '답장 필요'}</span><strong>{item.user_name} · {item.user_email}</strong><p>{item.content}</p></button>)}</div><ErrorNotice message={error} />
    {selected ? <div className="modal-backdrop"><div className="web-modal"><div className="modal-head"><h2>운영자 답장</h2><button onClick={() => setSelected(null)}>×</button></div><p className="long-copy">{selected.content}</p><label>답장<textarea rows={6} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} /></label><button className="primary-button" disabled={!reply.trim()} onClick={sendReply}>공지 알림으로 답장 보내기</button></div></div> : null}
  </>;
}
