import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Gift,
  MapPin,
  UsersRound,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, Recruitment } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  : '일정 확인 필요';

const formatEditorialCopy = (value?: string) => String(value || '')
  .replace(/\r/g, '')
  .replace(/\s*(■|□|●|▶|※)\s*/g, '\n\n$1 ')
  .replace(/([가-힣A-Za-z)])\s*-\s*(?=[가-힣A-Za-z0-9])/g, '$1\n- ')
  .replace(/([.!?])(?=[가-힣A-Z])/g, '$1\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export function InfoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const result = useAsync(async () => {
    const [activity, recruitments] = await Promise.all([
      api<ActivityItem>(`/api/activities/${id}`),
      api<Recruitment[]>(`/api/activities/${id}/recruitments`),
    ]);
    return { activity, recruitments };
  }, [id]);

  if (result.loading || result.error || !result.data) return <PageState loading={result.loading} error={result.error} />;
  const { activity, recruitments } = result.data;
  const externalUrl = activity.official_url || activity.source_url;
  const imageUrl = activity.main_image_url?.replace('10.0.2.2', 'localhost');
  const rawDetails = String(activity.details || '');
  const formattedDetails = formatEditorialCopy(
    rawDetails.startsWith(activity.title) ? rawDetails.slice(activity.title.length) : rawDetails,
  );
  const formattedPrizeDetails = formatEditorialCopy(activity.prize_details);
  const showPrizeDetails = Boolean(
    formattedPrizeDetails
    && formattedPrizeDetails.length <= 700
    && formattedPrizeDetails !== formattedDetails
    && (!formattedDetails || formattedPrizeDetails.length < formattedDetails.length * 0.8),
  );

  return <>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> 활동 정보</button>
    <div className="editorial-detail-layout">
      <article className="editorial-article">
        <header className="editorial-head">
          <div className="card-tags"><span>{activity.category || '활동'}</span><span>{activity.topic_category || '전체 분야'}</span></div>
          <h1>{activity.title}</h1>
          <p className="editorial-deck">{activity.organizer || '주최기관 확인 필요'}에서 진행하는 활동입니다. 일정과 지원 조건을 한눈에 확인하세요.</p>
          <div className="editorial-byline"><span><Building2 />{activity.organizer || '주최기관 미등록'}</span><span><CalendarDays />접수 {formatDate(activity.application_period_end)}까지</span></div>
        </header>

        {imageUrl && <figure className="editorial-poster"><img src={imageUrl} alt={`${activity.title} 포스터`} /></figure>}

        <section className="article-summary-grid">
          <div><span><CalendarDays /></span><strong>운영 기간</strong><p>{formatDate(activity.operation_period_start)}<br />~ {formatDate(activity.operation_period_end)}</p></div>
          <div><span><UsersRound /></span><strong>모집 대상</strong><p>{activity.target_audience || '공고 본문을 확인해주세요.'}</p></div>
          <div><span><MapPin /></span><strong>진행 장소</strong><p>{activity.location || '주최기관 안내 참고'}</p></div>
          <div><span><Gift /></span><strong>혜택·시상</strong><p>{activity.prize_summary || '공고 본문을 확인해주세요.'}</p></div>
        </section>

        {showPrizeDetails && <section className="article-callout prize"><Gift /><div><strong>시상 및 혜택</strong><p>{formattedPrizeDetails}</p></div></section>}

        <section className="article-body">
          <span className="eyebrow">ACTIVITY BRIEF</span>
          <h2>공고 상세</h2>
          <p>{formattedDetails || '등록된 상세 설명이 없습니다. 공식 공고에서 세부 내용을 확인해주세요.'}</p>
        </section>

        {externalUrl && <a className="article-external-link" href={externalUrl} target="_blank" rel="noreferrer"><ExternalLink /> 공식 공고에서 확인하기 <ArrowUpRight /></a>}
      </article>

      <aside className="editorial-aside">
        <section className="deadline-card">
          <span className="eyebrow">APPLICATION</span>
          <h2>지원 일정</h2>
          <div className="deadline-line"><span>접수 시작</span><strong>{formatDate(activity.application_period_start)}</strong></div>
          <div className="deadline-line"><span>접수 마감</span><strong>{formatDate(activity.application_period_end)}</strong></div>
          {externalUrl && <a className="primary-button" href={externalUrl} target="_blank" rel="noreferrer">지원 페이지 열기 <ArrowUpRight size={16} /></a>}
        </section>

        <section className="related-recruitments">
          <div className="aside-title"><div><span className="eyebrow">TEAM UP</span><h3>함께 준비할 팀</h3></div><em>{recruitments.length}</em></div>
          {recruitments.length ? recruitments.slice(0, 5).map((item) => <div className="aside-recruitment" key={item.recruitment_id}><span><UsersRound /></span><div><strong>{item.post_name}</strong><small>{item.meeting_type || '방식 협의'} · {item.required_members || '-'}명 모집</small></div></div>) : <p className="aside-empty">아직 모집 중인 팀이 없습니다.</p>}
        </section>

        <section className="reading-guide"><CheckCircle2 /><div><strong>읽기 전 확인하세요</strong><p>접수 일정과 자격 조건은 주최기관 사정에 따라 바뀔 수 있으니 공식 공고를 함께 확인해주세요.</p></div></section>
      </aside>
    </div>
  </>;
}
