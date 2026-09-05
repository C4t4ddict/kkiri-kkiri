import { Frown, Meh, MessageSquareText, Smile, Star, UsersRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { TeamSummary } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type Member = { user_id: number; name: string; part?: string };
type Rating = 'low' | 'medium' | 'high';
type ExistingReview = {
  review_low: number;
  review_medium: number;
  review_high: number;
  comment?: string;
};
type ReceivedReview = ExistingReview & {
  review_id: number;
  activity_title: string;
  reviewer_name: string;
  created_at: string;
};

const ratingFrom = (review?: ExistingReview | null): Rating | null => review?.review_high
  ? 'high'
  : review?.review_medium
    ? 'medium'
    : review?.review_low
      ? 'low'
      : null;

export function EvaluationsPage() {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const teams = useAsync(() => api<TeamSummary[]>('/my-teams'), []);
  useEffect(() => {
    if (!teamId && teams.data?.length) {
      setTeamId(teams.data.find((team) => team.participation_mode === 'TEAM')?.team_id || teams.data[0].team_id);
    }
  }, [teamId, teams.data]);
  const members = useAsync(() => teamId ? api<Member[]>(`/teams/${teamId}/members`) : Promise.resolve([]), [teamId]);
  useEffect(() => {
    const candidates = (members.data || []).filter((member) => member.user_id !== user?.id);
    if (!candidates.some((member) => member.user_id === memberId)) setMemberId(candidates[0]?.user_id || null);
  }, [memberId, members.data, user?.id]);
  const existing = useAsync(
    () => user?.id && memberId && teamId
      ? api<{ success: boolean; existingReview: ExistingReview | null }>(`/api/reviews/existing/${user.id}/${memberId}/${teamId}`)
      : Promise.resolve({ success: true, existingReview: null }),
    [user?.id, memberId, teamId],
  );
  useEffect(() => {
    setRating(ratingFrom(existing.data?.existingReview));
    setComment(existing.data?.existingReview?.comment || '');
  }, [existing.data]);
  const summary = useAsync(
    () => user?.id ? api<{ success: boolean; evaluations: { review_low: number; review_medium: number; review_high: number } }>(`/api/user/${user.id}/evaluations`) : Promise.resolve(null),
    [user?.id],
  );
  const received = useAsync(
    () => user?.id ? api<{ success: boolean; reviews: ReceivedReview[] }>(`/api/user/${user.id}/reviews`) : Promise.resolve(null),
    [user?.id],
  );
  const selectedMember = members.data?.find((member) => member.user_id === memberId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !teamId || !memberId || !rating || !comment.trim()) return;
    setMessage('');
    setError('');
    try {
      await api('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          reviewer_id: user.id,
          reviewee_id: memberId,
          related_team_id: teamId,
          review_high: rating === 'high' ? 1 : 0,
          review_medium: rating === 'medium' ? 1 : 0,
          review_low: rating === 'low' ? 1 : 0,
          comment: comment.trim(),
          is_update: Boolean(existing.data?.existingReview),
        }),
      });
      setMessage(`${selectedMember?.name || '팀원'}님의 평가를 ${existing.data?.existingReview ? '수정' : '저장'}했습니다.`);
      await existing.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '평가를 저장하지 못했습니다.');
    }
  };

  if (teams.loading) return <PageState loading />;

  const evaluation = summary.data?.evaluations;
  const ratingOptions: Array<{ value: Rating; label: string; icon: typeof Smile }> = [
    { value: 'low', label: '아쉬워요', icon: Frown },
    { value: 'medium', label: '좋아요', icon: Meh },
    { value: 'high', label: '최고예요', icon: Smile },
  ];

  return <>
    <PageTitle title="팀원·나의 평가" description="함께 활동한 팀원을 평가하고, 내가 받은 평가와 코멘트를 확인하세요." />
    <div className="evaluation-page-grid">
      <section className="content-card teammate-review-card">
        <div className="dashboard-section-head"><div><h3>팀원 평가</h3></div><UsersRound /></div>
        {!teams.data?.length ? <PageState empty="평가할 진행 활동이 없습니다." /> : <form onSubmit={submit}>
          <label>활동 선택<select value={teamId || ''} onChange={(event) => setTeamId(Number(event.target.value))}>{teams.data.map((team) => <option value={team.team_id} key={team.team_id}>{team.team_name}</option>)}</select></label>
          <label>팀원 선택<select value={memberId || ''} onChange={(event) => setMemberId(Number(event.target.value))}>{(members.data || []).filter((member) => member.user_id !== user?.id).map((member) => <option value={member.user_id} key={member.user_id}>{member.name} · {member.part || '역할 미정'}</option>)}</select></label>
          {memberId ? <><div className="rating-options">{ratingOptions.map(({ value, label, icon: Icon }) => <button type="button" className={rating === value ? 'active' : ''} onClick={() => setRating(value)} key={value}><Icon /><strong>{label}</strong></button>)}</div><label>평가 코멘트<textarea rows={6} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="함께 활동하며 좋았던 점과 도움이 될 의견을 남겨주세요." /></label><button className="primary-button" disabled={!rating || !comment.trim()}>{existing.data?.existingReview ? '평가 수정' : '평가 저장'}</button></> : <PageState empty="평가할 다른 팀원이 없습니다." />}
          {(message || error) && <div className={error ? 'form-error' : 'form-success'}>{error || message}</div>}
        </form>}
      </section>

      <section className="content-card received-review-card">
        <div className="dashboard-section-head"><div><h3>나의 평가</h3></div><Star /></div>
        <div className="evaluation-summary">{ratingOptions.map(({ value, label, icon: Icon }) => <div key={value}><span><Icon /></span><strong>{Number(evaluation?.[`review_${value}` as keyof typeof evaluation] || 0)}</strong><small>{label}</small></div>)}</div>
        <h4><MessageSquareText /> 받은 평가 코멘트</h4>
        <div className="received-review-list">{received.loading ? <PageState loading /> : received.data?.reviews?.length ? received.data.reviews.map((review) => <article key={review.review_id}><header><strong>{review.activity_title}</strong><span>{ratingFrom(review) === 'high' ? '최고예요' : ratingFrom(review) === 'medium' ? '좋아요' : '아쉬워요'}</span></header><p>{review.comment || '코멘트가 없습니다.'}</p><small>{review.reviewer_name} · {new Date(review.created_at).toLocaleDateString('ko-KR')}</small></article>) : <PageState empty="아직 받은 평가 코멘트가 없습니다." />}</div>
      </section>
    </div>
  </>;
}
