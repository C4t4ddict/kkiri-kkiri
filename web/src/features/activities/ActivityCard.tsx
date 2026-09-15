import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ActivityItem } from '../../shared/types/domain';
import { ActivityPosterImage } from './ActivityPosterImage';
import { getActivityCategoryLabel } from './activityCategory';
import { calendarDaysUntil } from '../../shared/date/calendarDaysUntil';

function Dday({ end }: { end?: string }) {
  const days = calendarDaysUntil(end);
  return <span>{days === null ? '일정 확인' : days < 0 ? '마감' : days === 0 ? '오늘 마감' : `접수중 D-${days}`}</span>;
}

export function ActivityCard({ item }: { item: ActivityItem }) {
  return <Link className="activity-card" to={`/info/${item.activity_id}`}>
    <ActivityPosterImage
      source={item.main_image_url}
      alt={`${item.title} 포스터`}
      fallback={<div className="poster-fallback"><Sparkles /></div>}
    />
    <div className="activity-card-body">
      <div className="card-tags">
        <span>{getActivityCategoryLabel(item.topic_category || item.category)}</span>
        <Dday end={item.application_period_end} />
      </div>
      <h3>{item.title}</h3>
      <p>{item.organizer || '주최기관 확인 필요'}</p>
      {Number(item.open_recruitment_count) > 0 && <div className="recruit-count">모집글 +{item.open_recruitment_count}</div>}
    </div>
  </Link>;
}
