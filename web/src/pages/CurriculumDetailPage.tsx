import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Curriculum } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { difficultyLabel } from '../features/curricula/CurriculumCard';
import { CurriculumScheduleDialog } from '../features/curricula/CurriculumScheduleDialog';
import '../styles/curricula.css';

export function CurriculumDetailPage() {
  const { id } = useParams();
  const result = useAsync(() => api<Curriculum>(`/api/curricula/${id}`), [id]);
  const [setupOpen, setSetupOpen] = useState(false);
  const item = result.data;
  if (result.loading || result.error || !item) return <PageState loading={result.loading} error={result.error} />;
  const nodes = item.nodes || [];
  const weeks = nodes.filter(node => node.level === 'WEEKLY');
  const daily = nodes.filter(node => node.level === 'DAILY');
  const ungrouped = daily.filter(node => !weeks.some(week => week.node_id === node.parent_node_id));
  const taskList = (tasks: typeof nodes) => <ol className="cp-task-list">{tasks.map(node => <li key={node.node_id}><div><strong>{node.title}</strong>{node.description && <p>{node.description}</p>}</div><small>{!node.is_required && '선택 · '}{node.estimated_minutes ? `${node.estimated_minutes}분` : '시간 미정'}</small></li>)}</ol>;

  return <div className="cp-page cp-detail-page">
    <Link className="cp-back" to="/curriculum"><ArrowLeft size={16} /> 커리큘럼 목록</Link>
    <header className="cp-detail-heading"><div className="cp-course-source"><span>{item.organization_name} · {item.role_title}</span>{item.is_example && <small>예시 과정</small>}</div><h1>{item.title}</h1><p>{item.summary}</p><div className="cp-course-facts"><span>{difficultyLabel[item.difficulty]}</span><span>{item.duration_weeks}주</span><span>주 {item.weekly_hours}시간</span><span>실행 과제 {daily.length}개</span></div></header>
    <div className="cp-detail-layout"><div>
      <section className="cp-description"><h2>무엇을 만들게 되나요?</h2><p>{item.description || item.summary}</p></section>
      <section className="cp-syllabus"><header><h2>학습 순서</h2><span>{weeks.length}개 학습 묶음</span></header>
        {nodes.filter(node => node.level === 'MONTHLY').length > 0 && <details className="cp-milestones"><summary>전체 도달 목표 보기</summary>{taskList(nodes.filter(node => node.level === 'MONTHLY'))}</details>}
        {weeks.map((week, index) => <details className="cp-week" key={week.node_id} open={index === 0 || undefined}><summary><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{week.title}</strong><small>{Math.floor(week.relative_start_day / 7) + 1}주차 · 실행 과제 {daily.filter(node => node.parent_node_id === week.node_id).length}개</small></div></summary><div className="cp-week-body">{week.description && <p>{week.description}</p>}{taskList(daily.filter(node => node.parent_node_id === week.node_id))}</div></details>)}
        {!!ungrouped.length && <details className="cp-week" open><summary><div><strong>개별 실행 과제</strong><small>{ungrouped.length}개</small></div></summary>{taskList(ungrouped)}</details>}
        {!nodes.length && <p className="cp-hint">아직 학습 목표가 등록되지 않았습니다.</p>}
      </section>
    </div><aside className="cp-start-panel"><h2>내 페이스로 시작하기</h2><p>학습할 요일과 하루 학습량을 정하면 과제를 순서대로 배치해드려요.</p><dl><div><dt>권장 학습량</dt><dd>주 {item.weekly_hours}시간</dd></div><div><dt>기본 과정 기간</dt><dd>{item.duration_weeks}주</dd></div></dl><button className="cp-primary" disabled={!nodes.length} onClick={() => setSetupOpen(true)}>내 일정에 추가 <ArrowRight size={16} /></button><small>확정하기 전까지 일정은 저장되지 않습니다.</small><p className="cp-privacy">개인 학습 기록은 기업에 공개되지 않습니다.{item.is_example && ' 이 과정은 기업 인증이 없는 학습용 예시입니다.'}</p></aside></div>
    {setupOpen && <CurriculumScheduleDialog curriculum={item} onClose={() => setSetupOpen(false)} />}
  </div>;
}
