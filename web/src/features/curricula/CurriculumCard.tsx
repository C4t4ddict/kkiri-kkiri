import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Curriculum } from '../../shared/types/domain';
import '../../styles/curricula.css';

export const difficultyLabel = { BEGINNER: '입문', INTERMEDIATE: '중급', ADVANCED: '심화' };

export function CurriculumCard({ curriculum: item }: { curriculum: Curriculum }) {
  return <Link className="cp-course" to={`/curriculum/${item.curriculum_id}`}>
    <div className="cp-course-source"><span>{item.organization_name}</span>{item.is_example && <small>예시 과정</small>}</div>
    <h2>{item.title}</h2><p>{item.summary}</p>
    <div className="cp-course-facts"><span>{difficultyLabel[item.difficulty]}</span><span>{item.duration_weeks}주</span><span>주 {item.weekly_hours}시간</span><span>{item.goal_count}개 목표</span></div>
    <footer><span>{item.role_title || '직무 공통'}</span><ArrowUpRight size={18} aria-hidden="true" /></footer>
  </Link>;
}
