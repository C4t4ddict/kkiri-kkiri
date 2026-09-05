import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveApiMediaUrl } from '../../shared/api/media';
import type { ActivityItem } from '../../shared/types/domain';
import { getActivityCategoryLabel } from './activityCategory';

function Dday({ end }: { end?: string }) {
  if (!end) return <span>일정 확인</span>;
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
  return <span>{days < 0 ? '마감' : `접수중 D-${days}`}</span>;
}

export function ActivityCard({ item }: { item: ActivityItem }) {
  return <Link className="activity-card" to={`/info/${item.activity_id}`}>
    {item.main_image_url
      ? <img src={resolveApiMediaUrl(item.main_image_url)} alt="" />
      : <div className="poster-fallback"><Sparkles /></div>}
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
