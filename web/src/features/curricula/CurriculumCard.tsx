import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Curriculum } from '../../shared/types/domain';

const difficultyLabel = {
  BEGINNER: '입문',
  INTERMEDIATE: '중급',
  ADVANCED: '심화',
};

export function CurriculumCard({ curriculum }: { curriculum: Curriculum }) {
  const brandColor = /^#[0-9A-F]{6}$/i.test(curriculum.brand_color || '')
    ? curriculum.brand_color
    : '#6c5ce7';
  return <Link
    className="curriculum-card"
    to={`/curriculum/${curriculum.curriculum_id}`}
    style={{ '--brand-color': brandColor } as CSSProperties}
  >
    <span className="curriculum-accent" />
    <div className="curriculum-company-row">
      <span className="company-monogram">{curriculum.organization_name.slice(0, 1)}</span>
      <span className="curriculum-company">
        <strong>{curriculum.organization_name}{curriculum.is_verified && <CheckCircle2 size={14} />}</strong>
        <small>{curriculum.role_title || '기술 직무 공통'}</small>
      </span>
      <span className={`difficulty-tag ${curriculum.difficulty.toLowerCase()}`}>{difficultyLabel[curriculum.difficulty]}</span>
    </div>
    <h3>{curriculum.title}</h3>
    <p>{curriculum.summary}</p>
    <div className="curriculum-meta">
      <span><CalendarDays size={15} />{curriculum.duration_weeks}주</span>
      <span><Clock3 size={15} />주 {curriculum.weekly_hours}시간</span>
      <span><CheckCircle2 size={15} />{curriculum.goal_count}개 목표</span>
    </div>
    <div className="curriculum-card-foot">
      <span>{curriculum.participant_count ? `${curriculum.participant_count}명이 학습 중` : '새로 공개된 과정'}</span>
      <strong>과정 보기 <ArrowUpRight size={15} /></strong>
    </div>
  </Link>;
}
