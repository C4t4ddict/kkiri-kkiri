import { Fragment, useId, type CSSProperties } from 'react';
import { goalProgress, type GoalGroups } from './goalProgress';
import './ActivityProgress.css';

// Same four-ring geometry and palette as src/Widget/Ringgraph.tsx in the app.
const rings = [
  { radius: 78, width: 13, color: 'var(--ring-1, #45247E)', end: 'var(--ring-1-end, #6842AE)', track: 'var(--ring-track, #E8E0F7)' },
  { radius: 60, width: 12, color: 'var(--ring-2, #7651BE)', end: 'var(--ring-2-end, #9574D6)', track: 'var(--ring-track, #EEE8FA)' },
  { radius: 43, width: 11, color: 'var(--ring-3, #A78BFA)', end: 'var(--ring-3-end, #BFAEF4)', track: 'var(--ring-track, #F1ECFB)' },
  { radius: 27, width: 10, color: 'var(--ring-4, #C7B7EE)', end: 'var(--ring-4-end, #DDD3F6)', track: 'var(--ring-track, #F4F0FB)' },
];

type Props = {
  groups: GoalGroups | null;
  today: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
};

export function ActivityProgress({ groups, today, loading, error, onRetry }: Props) {
  const id = useId();
  if (error) return <section className="activity-progress activity-progress-state" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>내 목표 진행률</h3>
    <p role="alert">목표 진행률을 불러오지 못했습니다. <button type="button" onClick={onRetry}>다시 시도</button></p>
  </section>;
  if (!groups) return <section className="activity-progress activity-progress-state" aria-busy="true">
    <h3>내 목표 진행률</h3><p role="status">선택한 활동의 목표를 확인하고 있습니다.</p>
  </section>;

  const metrics = goalProgress(groups, today);
  const summary = metrics[0];
  return <section className="activity-progress" aria-labelledby={`${id}-title`} aria-busy={loading}>
    <div className="activity-progress-copy">
      <h3 id={`${id}-title`}>내 목표 진행률</h3>
      <p className="activity-progress-total"><strong>{summary.total ? summary.percent : '—'}</strong>{summary.total > 0 && <span>%</span>}</p>
      <p className="activity-progress-count">{summary.total ? <><b>{summary.completed}개 완료</b> / {summary.total}개 목표</> : '아직 등록한 목표가 없어요'}</p>
      <p className="activity-progress-status">{summary.total
        ? summary.remaining ? <>진행 중 {summary.inProgress}개 · 완료까지 {summary.remaining}개</> : '현재 기간의 목표를 모두 마쳤어요'
        : '아래 목표 관리에서 첫 목표를 추가해보세요.'}</p>
      <small>이번 달 월간 목표와 이번 주 주간·일일 목표 기준</small>
      {loading && <small role="status">진행률 업데이트 중…</small>}
    </div>
    <svg className="activity-progress-rings" viewBox="0 0 178 178" role="img" aria-label={`목표 완료율, 바깥 링부터 ${metrics.map(metric => `${metric.label} ${metric.total ? `${metric.percent}%` : '목표 없음'}`).join(', ')}`}>
      <defs>{rings.map((ring, index) => <linearGradient key={ring.radius} id={`${id}-ring-${index}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={ring.color} /><stop offset="1" stopColor={ring.end} />
      </linearGradient>)}</defs>
      {rings.map((ring, index) => {
        const circumference = 2 * Math.PI * ring.radius;
        const percent = metrics[index].percent;
        return <Fragment key={ring.radius}>
          <circle cx="89" cy="89" r={ring.radius} fill="none" stroke={ring.track} strokeWidth={ring.width} />
          <circle className="activity-progress-ring-fill" cx="89" cy="89" r={ring.radius} fill="none" stroke={`url(#${id}-ring-${index})`} strokeWidth={ring.width} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} transform="rotate(-90 89 89)" opacity={percent > 0 ? 1 : 0} style={{ strokeDashoffset: circumference * (1 - percent / 100), '--ring-circumference': circumference } as CSSProperties} />
        </Fragment>;
      })}
    </svg>
    <div className="activity-progress-legend">
      <p>완료한 목표 <span>바깥 링부터</span></p>
      <ul>{metrics.map((metric, index) => <li key={metric.label}>
        <span className="activity-progress-dot" style={{ background: rings[index].color }} aria-hidden="true" />
        <span className="activity-progress-label">{metric.label}</span>
        <span className="activity-progress-fraction">{metric.total ? `${metric.completed} / ${metric.total}개` : '목표 없음'}</span>
        <strong>{metric.total ? `${metric.percent}%` : '—'}</strong>
      </li>)}</ul>
    </div>
  </section>;
}
