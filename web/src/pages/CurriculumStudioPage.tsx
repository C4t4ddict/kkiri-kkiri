import { ArrowRight, Building2, GripVertical, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import type { Curriculum } from '../shared/types/domain';
import { PageTitle } from '../shared/ui/PageTitle';

type DraftNode = {
  id: string;
  level: 'MONTHLY' | 'WEEKLY' | 'DAILY';
  title: string;
  description: string;
  relative_start_day: number;
  relative_end_day: number;
  estimated_minutes: number;
};

const createNode = (level: DraftNode['level'] = 'DAILY'): DraftNode => ({
  id: crypto.randomUUID(),
  level,
  title: '',
  description: '',
  relative_start_day: 0,
  relative_end_day: level === 'DAILY' ? 0 : level === 'WEEKLY' ? 6 : 27,
  estimated_minutes: level === 'DAILY' ? 60 : 180,
});

export function CurriculumStudioPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DraftNode[]>([
    createNode('MONTHLY'),
    createNode('WEEKLY'),
    createNode('DAILY'),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!user?.is_admin) return <Navigate to="/" replace />;

  const updateNode = (id: string, patch: Partial<DraftNode>) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, ...patch } : node));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const curriculum = await api<Curriculum>('/api/admin/curricula', {
        method: 'POST',
        body: JSON.stringify({
          organization_name: form.get('organization_name'),
          brand_color: form.get('brand_color'),
          title: form.get('title'),
          role_title: form.get('role_title'),
          summary: form.get('summary'),
          description: form.get('description'),
          difficulty: form.get('difficulty'),
          duration_weeks: Number(form.get('duration_weeks')),
          weekly_hours: Number(form.get('weekly_hours')),
          status: form.get('publish_now') === 'on' ? 'PUBLISHED' : 'DRAFT',
          organization_verified: true,
          nodes: nodes.map((node, index) => ({
            ...node,
            stable_key: `${node.level.toLowerCase()}-${index + 1}`,
            sort_order: (index + 1) * 10,
            is_required: true,
            assignment_mode: 'ALL_MEMBERS',
          })),
        }),
      });
      navigate(`/curriculum/${curriculum.curriculum_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '커리큘럼을 저장하지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <PageTitle title="기업 커리큘럼 만들기" description="기업의 기술 요구를 사용자가 실행할 수 있는 월간·주간·일일 목표로 구성하세요." />
    <form className="curriculum-studio" onSubmit={submit}>
      <section className="studio-main">
        <article className="studio-card">
          <div className="studio-card-head"><span><Building2 /></span><div><h2>기업과 과정 정보</h2><p>탐색 카드와 상세 화면에 표시되는 기본 정보입니다.</p></div></div>
          <div className="studio-grid two">
            <label>기업명<input name="organization_name" placeholder="예: 끼리끼리 테크 파트너" required /></label>
            <label>브랜드 컬러<input name="brand_color" type="color" defaultValue="#6C5CE7" /></label>
            <label className="wide">커리큘럼 제목<input name="title" placeholder="예: Kubernetes 실무 로드맵" required /></label>
            <label>대상 직무<input name="role_title" placeholder="Cloud Platform Engineer" /></label>
            <label>난이도<select name="difficulty" defaultValue="BEGINNER"><option value="BEGINNER">입문</option><option value="INTERMEDIATE">중급</option><option value="ADVANCED">심화</option></select></label>
            <label>권장 기간<input name="duration_weeks" type="number" min="1" max="104" defaultValue="8" required /></label>
            <label>주당 학습시간<input name="weekly_hours" type="number" min="0.5" max="80" step="0.5" defaultValue="5" required /></label>
            <label className="wide">한 줄 요약<textarea name="summary" rows={2} maxLength={500} placeholder="사용자가 과정의 가치와 결과를 빠르게 이해할 수 있게 작성해주세요." required /></label>
            <label className="wide">상세 설명<textarea name="description" rows={6} placeholder="학습 배경, 기대 결과, 권장 선수 지식을 설명해주세요." /></label>
          </div>
        </article>

        <article className="studio-card">
          <div className="studio-card-head"><span><Sparkles /></span><div><h2>학습 목표 구성</h2><p>상대 날짜로 작성하면 사용자의 시작일과 가능 요일에 맞춰 실제 일정이 만들어집니다.</p></div><button type="button" className="ghost-button compact" onClick={() => setNodes((current) => [...current, createNode()])}><Plus /> 목표 추가</button></div>
          <div className="node-editor-list">{nodes.map((node, index) => <div className="node-editor" key={node.id}>
            <GripVertical className="node-grip" />
            <span className={`node-level ${node.level.toLowerCase()}`}>{node.level === 'MONTHLY' ? '월간' : node.level === 'WEEKLY' ? '주간' : '일일'}</span>
            <div className="node-editor-fields">
              <div className="studio-grid node-grid">
                <label>단계<select value={node.level} onChange={(event) => updateNode(node.id, { level: event.target.value as DraftNode['level'] })}><option value="MONTHLY">월간 마일스톤</option><option value="WEEKLY">주간 목표</option><option value="DAILY">일일 실행</option></select></label>
                <label className="node-title-input">목표 제목<input value={node.title} onChange={(event) => updateNode(node.id, { title: event.target.value })} placeholder={`${index + 1}번째 목표`} required /></label>
                <label>시작 +일<input type="number" min="0" value={node.relative_start_day} onChange={(event) => updateNode(node.id, { relative_start_day: Number(event.target.value) })} /></label>
                <label>종료 +일<input type="number" min={node.relative_start_day} value={node.relative_end_day} onChange={(event) => updateNode(node.id, { relative_end_day: Number(event.target.value) })} /></label>
                <label>예상 시간(분)<input type="number" min="0" value={node.estimated_minutes} onChange={(event) => updateNode(node.id, { estimated_minutes: Number(event.target.value) })} /></label>
                <label className="wide">설명<input value={node.description} onChange={(event) => updateNode(node.id, { description: event.target.value })} placeholder="사용자가 이해할 수 있는 수행 기준" /></label>
              </div>
            </div>
            <button type="button" className="node-delete" aria-label="목표 삭제" disabled={nodes.length <= 1} onClick={() => setNodes((current) => current.filter((item) => item.id !== node.id))}><Trash2 /></button>
          </div>)}</div>
        </article>
      </section>

      <aside className="studio-aside">
        <section><h3>배포 전 확인</h3><ul><li><span>{nodes.length > 0 && <Save />}</span>최소 1개 이상의 목표</li><li><span>{nodes.some((node) => node.level === 'MONTHLY') && <Save />}</span>월간 마일스톤</li><li><span>{nodes.some((node) => node.level === 'DAILY') && <Save />}</span>실행 가능한 일일 목표</li></ul><label className="publish-check"><input type="checkbox" name="publish_now" defaultChecked /><span><strong>바로 공개하기</strong><small>저장 즉시 사용자가 탐색할 수 있습니다.</small></span></label></section>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button studio-submit" disabled={saving}>{saving ? '저장 중…' : '커리큘럼 저장'} <ArrowRight /></button>
      </aside>
    </form>
  </>;
}
