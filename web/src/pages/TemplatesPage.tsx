import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ApplicationTemplate } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

export function TemplatesPage() {
  const result = useAsync(() => api<ApplicationTemplate[]>('/api/application-templates'), []);
  const [editing, setEditing] = useState<ApplicationTemplate | null | undefined>(undefined);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = JSON.stringify({ title: form.get('title'), content: form.get('content'), is_default: form.get('is_default') === 'on' });
    await api(editing ? `/api/application-templates/${editing.template_id}` : '/api/application-templates', { method: editing ? 'PUT' : 'POST', body });
    setEditing(undefined);
    await result.reload();
  };

  const remove = async (id: number) => {
    if (!window.confirm('이 지원서를 삭제할까요?')) return;
    await api(`/api/application-templates/${id}`, { method: 'DELETE' });
    await result.reload();
  };

  return <>
    <div className="title-actions"><PageTitle eyebrow="APPLICATION LIBRARY" title="지원서 관리" description="자주 사용하는 지원 내용을 저장하고 모집글에서 불러오세요." /><button className="primary-button compact" onClick={() => setEditing(null)}>새 템플릿</button></div>
    <PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '첫 지원서 템플릿을 만들어보세요.' : undefined} />
    <div className="template-grid">{result.data?.map((template) => <article className="template-card" key={template.template_id}><div><h3>{template.title} {template.is_default && <span>기본</span>}</h3><p>{template.content}</p></div><div className="button-row"><button className="ghost-button" onClick={() => setEditing(template)}>수정</button><button className="text-danger" onClick={() => remove(template.template_id)}>삭제</button></div></article>)}</div>
    {editing !== undefined && <div className="modal-backdrop"><form className="web-modal" onSubmit={save}><div className="modal-head"><h2>{editing ? '지원서 수정' : '새 지원서'}</h2><button type="button" aria-label="닫기" onClick={() => setEditing(undefined)}><X size={20} /></button></div><label>템플릿 이름<input name="title" maxLength={80} defaultValue={editing?.title} required /></label><label>지원 내용<textarea name="content" maxLength={2000} rows={10} defaultValue={editing?.content} required /></label><label className="check-label"><input type="checkbox" name="is_default" defaultChecked={Boolean(editing?.is_default)} /> 기본 지원서로 사용</label><button className="primary-button">저장하기</button></form></div>}
  </>;
}
