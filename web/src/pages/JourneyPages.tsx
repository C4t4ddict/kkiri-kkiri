import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  UsersRound,
} from 'lucide-react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api, API_BASE_URL } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import { PageState } from '../shared/ui/PageState';
import type { TeamSummary } from '../shared/types/domain';
import './journey.css';

type Task = {
  todo_id: number;
  title: string;
  assigned_user_id: number;
  assignee_name: string;
  status: string;
  scope_end_date: string;
  document_id?: number;
};
type RecordItem = {
  record_id: number;
  user_id: number;
  todo_id: number;
  document_id?: number;
  title: string;
  contribution: string;
  outcome: string;
  artifact_url: string;
  author_name: string;
  document_title?: string;
  task_status: string;
  confirmation_count: number;
  confirmed_by_me: boolean;
  version: number;
};
type Workspace = {
  team: TeamSummary & { phase: string };
  members: { user_id: number; name: string; part?: string }[];
  tasks: Task[];
  documents: { document_id: number; title: string }[];
  records: RecordItem[];
  portfolio_id: number | null;
};
type Draft = Workspace & {
  activity_name: string;
  user_name: string;
  role: string;
  summary: string;
  reflection: string;
  period: string;
  share: { token: string; published_at: string } | null;
};
type Snapshot = Pick<
  Draft,
  'activity_name' | 'user_name' | 'role' | 'summary' | 'reflection' | 'period'
> & {
  phase: string;
  records: Pick<
    RecordItem,
    | 'title'
    | 'contribution'
    | 'outcome'
    | 'artifact_url'
    | 'task_status'
    | 'confirmation_count'
  >[];
};
type Template = { id: string; title: string; markdown: string };
const phaseLabel: Record<string, string> = {
  IN_PROGRESS: '진행 중',
  WRAPPING: '마무리 중',
  COMPLETED: '완료한 활동',
};
const base = (teamId: string | number) => `/api/journey/teams/${teamId}`;
const date = (value?: string) => value?.slice(0, 10) || '미정';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
};
const useAction = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const run = async (work: () => Promise<unknown>, success = '') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await work();
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '다시 시도해주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, message, error, run };
};
const Feedback = ({ message, error }: { message: string; error: string }) => (
  <>
    {error && (
      <p className="journey-feedback error" role="alert">
        {error}
      </p>
    )}
    {message && (
      <p className="journey-feedback" role="status">
        {message}
      </p>
    )}
  </>
);
const DocumentLink = ({
  teamId,
  documentId,
  children,
}: {
  teamId: string | number;
  documentId: number;
  children: React.ReactNode;
}) => (
  <Link to={`/activity/${teamId}/documents?document=${documentId}`}>
    <FileText size={16} />
    {children}
  </Link>
);

export function JourneyWorkspacePage() {
  const { teamId } = useParams();
  return <JourneyWorkspace key={teamId} />;
}

function JourneyWorkspace() {
  const { teamId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const result = useAsync(() => api<Workspace>(base(teamId)), [teamId]);
  const templates = useAsync(
    () => api<Template[]>('/api/journey/templates'),
    [],
  );
  const action = useAction();
  const [tab, setTab] = useState<'tasks' | 'records'>('tasks');
  const [recordTask, setRecordTask] = useState<number | null>(
    () => Number(params.get('task')) || null,
  );
  const [inviteUrl, setInviteUrl] = useState('');
  useEffect(() => {
    setInviteUrl('');
    setRecordTask(Number(params.get('task')) || null);
  }, [teamId, params]);
  useEffect(() => {
    if (recordTask)
      document
        .getElementById('journey-record-editor')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [recordTask]);
  if (!result.data)
    return <PageState loading={result.loading} error={result.error} />;
  const data = result.data;
  const complete = data.team.phase === 'COMPLETED';
  const wrapping = data.team.phase === 'WRAPPING';
  const leader = Number(data.team.leader_user_id) === user?.id;
  const myMember = data.members.find(
    member => Number(member.user_id) === user?.id,
  );
  const selected = data.tasks.find(task => task.todo_id === recordTask);
  const ownRecord = data.records.find(
    record => record.todo_id === recordTask && record.user_id === user?.id,
  );
  const reload = async () => {
    await result.reload();
  };
  const changePhase = (phase: string) =>
    action.run(
      async () => {
        await api(`${base(teamId)}/phase`, {
          method: 'PUT',
          body: JSON.stringify({ phase }),
        });
        await reload();
      },
      phase === 'COMPLETED'
        ? '활동을 보관했습니다. 문서·기여 기록·평가는 계속 확인할 수 있습니다.'
        : '활동 상태를 변경했습니다.',
    );
  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    action.run(async () => {
      await api(`${base(teamId)}/tasks`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(values)),
      });
      form.reset();
      await reload();
    }, '공동 작업을 추가했습니다.');
  };
  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    action.run(async () => {
      await api(`${base(teamId)}/records`, {
        method: 'POST',
        body: JSON.stringify({
          ...Object.fromEntries(values),
          todo_id: recordTask,
        }),
      });
      setRecordTask(null);
      setTab('records');
      await reload();
    }, '내 기여를 포트폴리오 초안에 연결했습니다.');
  };
  return (
    <div className="journey-page">
      <Link
        className="back-link"
        to={complete ? '/mypage/archive' : `/activity?team=${teamId}`}
      >
        <ArrowLeft /> {complete ? '지난 활동' : '나의 활동'}
      </Link>
      <header className="journey-header">
        <div>
          <span className="journey-status">{phaseLabel[data.team.phase]}</span>
          <h1>{data.team.team_name}</h1>
          <p>
            {data.members.length}명 함께하는 중 · 마감{' '}
            {date(data.team.due_date)}
          </p>
        </div>
        <Link className="primary-button" to={`/activity/${teamId}/portfolio`}>
          내 포트폴리오 <ArrowRight size={17} />
        </Link>
      </header>
      <nav className="journey-nav" aria-label="팀 활동 메뉴">
        <Link aria-current="page" to={`/activity/${teamId}/work`}>
          공동 작업
        </Link>
        <Link to={`/activity/${teamId}/documents`}>활동 문서</Link>
        <Link to={`/activity/${teamId}/portfolio`}>내 기록·포트폴리오</Link>
        <Link to={`/mypage/evaluations?team=${teamId}`}>팀원 평가</Link>
      </nav>
      <Feedback {...action} />
      {result.error && (
        <p role="alert">
          {result.error}
          <button onClick={reload}>다시 확인</button>
        </p>
      )}
      {(wrapping || complete) && (
        <section className="journey-wrap">
          <strong>
            {complete
              ? '활동이 끝나도 기록은 이어집니다.'
              : '결과를 정리하고 각자의 경험으로 남겨보세요.'}
          </strong>
          <p>
            결과물 연결 → 내 기여 확인 → 회고·평가 순서로 마무리하세요. 아직
            작성하지 않은 팀원이 있어도 나중에 이어서 남길 수 있습니다.
          </p>
          <div className="button-row">
            <Link className="ghost-button" to={`/activity/${teamId}/portfolio`}>
              내 기록 정리
            </Link>
            <Link
              className="ghost-button"
              to={`/mypage/evaluations?team=${teamId}`}
            >
              팀원 평가하기
            </Link>
          </div>
        </section>
      )}
      <div className="journey-layout">
        <main>
          {!complete && (
            <section className="journey-start">
              <h2>함께 시작하기</h2>
              <ol>
                <li className={myMember?.part ? 'done' : ''}>
                  <Check size={15} /> 내 역할 {myMember?.part || '정하기'}
                  <Link to={`/activity/${teamId}/manage#activity-settings`}>
                    수정
                  </Link>
                </li>
                <li className={data.tasks.length ? 'done' : ''}>
                  <Check size={15} /> 공동 작업과 마감 정하기
                  <a href="#journey-new-task">작업 추가</a>
                </li>
                <li
                  className={
                    data.records.some(r => r.user_id === user?.id) ? 'done' : ''
                  }
                >
                  <Check size={15} /> 결과물과 내 기여 연결하기
                  <button
                    onClick={() =>
                      setRecordTask(
                        data.tasks.find(t => t.assigned_user_id === user?.id)
                          ?.todo_id ||
                          data.tasks[0]?.todo_id ||
                          null,
                      )
                    }
                  >
                    기록하기
                  </button>
                </li>
              </ol>
            </section>
          )}
          <div className="journey-section-heading">
            <div className="journey-tabs" role="group" aria-label="작업과 기록">
              <button
                aria-pressed={tab === 'tasks'}
                onClick={() => setTab('tasks')}
              >
                공동 작업 <span>{data.tasks.length}</span>
              </button>
              <button
                aria-pressed={tab === 'records'}
                onClick={() => setTab('records')}
              >
                기여 기록 <span>{data.records.length}</span>
              </button>
            </div>
            <span>
              {data.tasks.filter(task => task.status === '완료').length}개 완료
            </span>
          </div>
          {tab === 'tasks' ? (
            <div className="journey-task-list">
              {data.tasks.map(task => (
                <article
                  key={task.todo_id}
                  className={
                    task.status === '완료'
                      ? 'done'
                      : task.status === '진행중'
                      ? 'active'
                      : ''
                  }
                >
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.assignee_name} · {date(task.scope_end_date)}까지
                    </small>
                    {task.document_id && (
                      <DocumentLink
                        teamId={teamId}
                        documentId={task.document_id}
                      >
                        관련 문서
                      </DocumentLink>
                    )}
                  </div>
                  <label>
                    <span className="sr-only">{task.title} 상태</span>
                    <select
                      aria-label={`${task.title} 상태`}
                      value={task.status}
                      disabled={complete || action.busy}
                      onChange={event => {
                        const status = event.target.value;
                        action.run(async () => {
                          await api(`${base(teamId)}/tasks/${task.todo_id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ status }),
                          });
                          await reload();
                        }, '작업 상태를 저장했습니다.');
                      }}
                    >
                      <option value="미진행">시작 전</option>
                      <option value="진행중">진행 중</option>
                      <option value="완료">완료</option>
                    </select>
                  </label>
                  <button
                    className="ghost-button"
                    onClick={() => setRecordTask(task.todo_id)}
                  >
                    근거·내 기여
                  </button>
                </article>
              ))}
              {!data.tasks.length && (
                <p className="journey-empty">
                  첫 공동 작업을 정해보세요. 담당자와 마감일부터 시작하면
                  됩니다.
                </p>
              )}
              {data.tasks.length === 500 && (
                <p>최근 범위의 작업 500개를 표시합니다.</p>
              )}
            </div>
          ) : (
            <div className="journey-record-list">
              {data.records.map(record => (
                <article key={record.record_id}>
                  <div className="journey-section-heading">
                    <h3>{record.title}</h3>
                    <small>
                      {record.author_name} ·{' '}
                      {record.confirmation_count
                        ? `팀원 ${record.confirmation_count}명 확인`
                        : '본인 작성'}
                    </small>
                  </div>
                  <p>{record.contribution}</p>
                  {record.outcome && (
                    <p>
                      <strong>결과</strong> {record.outcome}
                    </p>
                  )}
                  <div className="journey-record-links">
                    {record.document_id && record.document_title && (
                      <DocumentLink
                        teamId={teamId}
                        documentId={record.document_id}
                      >
                        {record.document_title}
                      </DocumentLink>
                    )}
                    {record.artifact_url && (
                      <a
                        href={record.artifact_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        결과물 <ExternalLink size={15} />
                      </a>
                    )}
                    {record.user_id === user?.id ? (
                      <button onClick={() => setRecordTask(record.todo_id)}>
                        내 기록 수정
                      </button>
                    ) : (
                      <button
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            async () => {
                              await api(
                                `${base(teamId)}/records/${
                                  record.record_id
                                }/confirm`,
                                {
                                  method: 'PUT',
                                  body: JSON.stringify({
                                    version: record.version,
                                    confirm: !record.confirmed_by_me,
                                  }),
                                },
                              );
                              await reload();
                            },
                            record.confirmed_by_me
                              ? '확인을 취소했습니다.'
                              : '함께한 기여를 확인했습니다.',
                          )
                        }
                      >
                        {record.confirmed_by_me
                          ? '확인 취소'
                          : '이 기여를 확인했어요'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!data.records.length && (
                <p className="journey-empty">
                  작업의 ‘근거·내 기여’에서 결과물과 맡은 일을 연결해보세요.
                </p>
              )}
            </div>
          )}
          {selected && (
            <section
              className="journey-panel"
              id="journey-record-editor"
              key={`${selected.todo_id}-${ownRecord?.version || 0}`}
            >
              <div className="journey-section-heading">
                <h2>내 기여 기록</h2>
                <button onClick={() => setRecordTask(null)}>닫기</button>
              </div>
              <p>
                {selected.title} · {selected.status}
              </p>
              <form className="journey-form" onSubmit={saveRecord}>
                <label>
                  내가 맡아 한 일
                  <textarea
                    name="contribution"
                    rows={3}
                    maxLength={2000}
                    required
                    defaultValue={ownRecord?.contribution}
                    placeholder="팀 결과 중 내가 맡은 부분과 해결한 일을 적어주세요."
                  />
                </label>
                <label>
                  관련 활동 문서
                  <select
                    name="document_id"
                    defaultValue={
                      ownRecord?.document_id || selected.document_id || ''
                    }
                  >
                    <option value="">문서 선택</option>
                    {data.documents.map(doc => (
                      <option value={doc.document_id} key={doc.document_id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  결과물 링크
                  <input
                    name="artifact_url"
                    type="url"
                    maxLength={2000}
                    defaultValue={ownRecord?.artifact_url}
                    placeholder="Figma, GitHub, Drive 등 결과물 주소"
                  />
                </label>
                <label>
                  확인한 결과 <span>선택</span>
                  <textarea
                    name="outcome"
                    rows={2}
                    maxLength={2000}
                    defaultValue={ownRecord?.outcome}
                    placeholder="실제 확인한 변화나 배운 점을 적어주세요."
                  />
                </label>
                <p className="journey-hint">
                  문서나 링크를 하나 이상 연결해주세요. 내용 수정 시 기존 팀원
                  확인은 초기화됩니다.
                </p>
                <button className="primary-button" disabled={action.busy}>
                  내 포트폴리오에 기록
                </button>
              </form>
            </section>
          )}
          {!complete && (
            <section className="journey-panel" id="journey-new-task">
              <h2>다음 공동 작업</h2>
              <form className="journey-form" onSubmit={addTask}>
                <label>
                  할 일
                  <input
                    name="title"
                    required
                    maxLength={255}
                    placeholder="어떤 결과를 만들까요?"
                  />
                </label>
                <div className="journey-form-row">
                  <label>
                    담당자
                    <select name="assigned_user_id" defaultValue={user?.id}>
                      {data.members.map(member => (
                        <option value={member.user_id} key={member.user_id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    마감
                    <input
                      name="due_date"
                      type="date"
                      required
                      defaultValue={today()}
                    />
                  </label>
                </div>
                <label>
                  시작한 문서 <span>선택</span>
                  <select
                    name="document_id"
                    defaultValue={params.get('document') || ''}
                  >
                    <option value="">연결하지 않음</option>
                    {data.documents.map(doc => (
                      <option value={doc.document_id} key={doc.document_id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" disabled={action.busy}>
                  <Plus size={16} /> 작업 추가
                </button>
              </form>
            </section>
          )}
        </main>
        <aside className="journey-aside">
          <section className="journey-panel">
            <h2>함께하는 사람</h2>
            {data.members.map(member => (
              <div className="journey-person" key={member.user_id}>
                <strong>{member.name}</strong>
                <span>{member.part || '역할 정하기'}</span>
              </div>
            ))}
            {leader && !complete && (
              <div className="journey-invite-controls">
                <button
                  className="ghost-button"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      const response = await api<{ token: string }>(
                        `${base(teamId)}/invite`,
                        { method: 'POST' },
                      );
                      setInviteUrl(
                        `${window.location.origin}/join/${response.token}`,
                      );
                    }, '7일 동안 사용할 초대 링크를 만들었습니다. 이전 링크는 해제됩니다.')
                  }
                >
                  팀원 초대 링크 만들기
                </button>
                {inviteUrl && <CopyLink value={inviteUrl} />}
                <button
                  className="text-link"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      await api(`${base(teamId)}/invite`, { method: 'DELETE' });
                      setInviteUrl('');
                    }, '이 팀의 초대 링크를 해제했습니다.')
                  }
                >
                  초대 링크 해제
                </button>
              </div>
            )}
          </section>
          <section className="journey-panel">
            <h2>문서로 시작하기</h2>
            <p className="journey-hint">
              필요한 틀을 고르고 팀의 내용으로 채워보세요.
            </p>
            {templates.data?.map(template => (
              <button
                className="journey-template"
                disabled={action.busy}
                key={template.id}
                onClick={() =>
                  action.run(async () => {
                    const created = await api<{ document_id: number }>(
                      `/teams/${teamId}/documents`,
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          title: template.title,
                          content_markdown: template.markdown,
                        }),
                      },
                    );
                    navigate(
                      `/activity/${teamId}/documents?document=${created.document_id}`,
                    );
                  })
                }
              >
                <FileText size={17} />
                {template.title}
                <ArrowRight size={15} />
              </button>
            ))}
            {templates.error && (
              <p role="alert">
                {templates.error}
                <button onClick={templates.reload}>다시 시도</button>
              </p>
            )}
          </section>
          {leader && !complete && (
            <section className="journey-panel">
              <h2>활동 마무리</h2>
              <p className="journey-hint">
                마감일이 지나도 작업과 기록은 유지됩니다.
              </p>
              {!wrapping ? (
                <button
                  className="ghost-button"
                  disabled={action.busy}
                  onClick={() => changePhase('WRAPPING')}
                >
                  마무리 시작
                </button>
              ) : (
                <>
                  <p>
                    {data.tasks.filter(t => t.status !== '완료').length}개
                    미완료 작업 · 내 기여{' '}
                    {data.records.filter(r => r.user_id === user?.id).length}개
                  </p>
                  <p className="journey-hint">
                    보관하면 작업 상태는 고정됩니다. 기여·회고·평가는 이후에도
                    작성할 수 있습니다.
                  </p>
                  <button
                    className="primary-button"
                    disabled={action.busy}
                    onClick={() => changePhase('COMPLETED')}
                  >
                    기록을 유지하고 활동 보관
                  </button>
                  <button
                    className="text-link"
                    disabled={action.busy}
                    onClick={() => changePhase('IN_PROGRESS')}
                  >
                    진행으로 돌아가기
                  </button>
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="journey-copy">
      <input
        aria-label="공유할 링크"
        value={value}
        readOnly
        onFocus={event => event.target.select()}
      />
      <button
        type="button"
        aria-label="링크 복사"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={16} />
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

function SnapshotView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <article className="journey-portfolio">
      <header>
        <span>끼리끼리 · 미니포트폴리오</span>
        <h1>{snapshot.activity_name}</h1>
        <p>
          {snapshot.user_name} · {snapshot.role || '팀원'}
        </p>
        <small>
          {snapshot.period} · {phaseLabel[snapshot.phase] || '활동 기록'}
        </small>
      </header>
      {snapshot.summary && (
        <section>
          <h2>활동 소개</h2>
          <p>{snapshot.summary}</p>
        </section>
      )}
      <section>
        <h2>내가 기여한 경험</h2>
        {snapshot.records.map((record, index) => (
          <article className="journey-evidence" key={index}>
            <h3>{record.title}</h3>
            <small>
              {record.task_status} ·{' '}
              {record.confirmation_count
                ? `팀원 ${record.confirmation_count}명 확인`
                : '본인 작성'}
            </small>
            <p>{record.contribution}</p>
            {record.outcome && (
              <p>
                <strong>결과</strong> {record.outcome}
              </p>
            )}
            {record.artifact_url && (
              <a href={record.artifact_url} target="_blank" rel="noreferrer">
                결과물 확인 <ExternalLink size={16} />
              </a>
            )}
          </article>
        ))}
        {!snapshot.records.length && (
          <p>위에서 포함할 기여 기록을 선택해주세요.</p>
        )}
      </section>
      {snapshot.reflection && (
        <section>
          <h2>회고</h2>
          <p>{snapshot.reflection}</p>
        </section>
      )}
    </article>
  );
}

export function JourneyPortfolioPage() {
  const { teamId } = useParams();
  return <JourneyPortfolio key={teamId} />;
}

function JourneyPortfolio() {
  const { teamId = '' } = useParams();
  const result = useAsync(() => api<Draft>(`${base(teamId)}/draft`), [teamId]);
  const action = useAction();
  const [summary, setSummary] = useState('');
  const [reflection, setReflection] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [includeLinks, setIncludeLinks] = useState(false);
  const [includeReflection, setIncludeReflection] = useState(false);
  const loadedTeam = useRef('');
  const dirtyDraft = Boolean(
    result.data &&
      (summary !== result.data.summary ||
        reflection !== result.data.reflection) &&
      loadedTeam.current === teamId,
  );
  useEffect(() => {
    if (!dirtyDraft) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const confirmLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]');
      if (
        link &&
        !(link as HTMLAnchorElement).target &&
        !window.confirm(
          '저장하지 않은 소개·회고가 있습니다. 이 페이지를 나갈까요?',
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', confirmLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', confirmLink, true);
    };
  }, [dirtyDraft]);
  useEffect(() => {
    if (result.data && loadedTeam.current !== teamId) {
      loadedTeam.current = teamId;
      setSummary(result.data.summary);
      setReflection(result.data.reflection);
      setSelected(
        result.data.records
          .filter(r => r.task_status === '완료')
          .slice(0, 30)
          .map(r => r.record_id),
      );
    }
  }, [result.data, teamId]);
  if (!result.data)
    return <PageState loading={result.loading} error={result.error} />;
  const data = result.data;
  const dirty = summary !== data.summary || reflection !== data.reflection;
  const snapshot: Snapshot = {
    activity_name: data.activity_name,
    user_name: data.user_name,
    role: data.role,
    summary,
    reflection: includeReflection ? reflection : '',
    period: data.period,
    phase: data.team.phase,
    records: data.records
      .filter(record => selected.includes(record.record_id))
      .map(record => ({
        ...record,
        artifact_url: includeLinks ? record.artifact_url : '',
      })),
  };
  const payload = {
    record_ids: selected,
    include_links: includeLinks,
    include_reflection: includeReflection,
  };
  const exportPdf = () =>
    action.run(async () => {
      const token = localStorage.getItem('kkiri_token');
      const response = await fetch(`${API_BASE_URL}${base(teamId)}/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          'PDF를 만들지 못했습니다. 기록을 확인하고 다시 시도해주세요.',
        );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '끼리끼리-미니포트폴리오.pdf';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <div className="journey-page journey-draft">
      <Link className="back-link" to={`/activity/${teamId}/work`}>
        <ArrowLeft /> 팀 활동으로 돌아가기
      </Link>
      <header className="journey-header">
        <div>
          <span className="journey-status">내 기록 · 비공개 초안</span>
          <h1>경험이 쌓이고 있어요</h1>
          <p>
            {data.activity_name} · 내 기여 {data.records.length}개
          </p>
        </div>
        <Link className="ghost-button" to={`/activity/${teamId}/work`}>
          기여 기록 추가 <Plus size={16} />
        </Link>
      </header>
      <Feedback {...action} />
      {result.error && <p role="alert">{result.error}</p>}
      <section className="journey-panel">
        <h2>내 이야기 다듬기</h2>
        <form
          className="journey-form"
          onSubmit={event => {
            event.preventDefault();
            action.run(async () => {
              await api(`${base(teamId)}/draft`, {
                method: 'PUT',
                body: JSON.stringify({ summary, reflection }),
              });
              await result.reload();
            }, '소개와 회고를 저장했습니다.');
          }}
        >
          <label>
            활동 소개
            <textarea
              value={summary}
              onChange={event => setSummary(event.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="어떤 문제를 해결하기 위한 활동이었나요?"
            />
          </label>
          <label>
            내 회고
            <textarea
              value={reflection}
              onChange={event => setReflection(event.target.value)}
              maxLength={5000}
              rows={3}
              placeholder="배운 점과 다음에 바꾸고 싶은 점을 적어주세요."
            />
          </label>
          <button className="primary-button" disabled={action.busy || !dirty}>
            소개·회고 저장
          </button>
          {dirty && (
            <p role="status" className="journey-hint">
              저장 후 공유하거나 PDF로 내려받을 수 있습니다.
            </p>
          )}
        </form>
      </section>
      <section className="journey-panel">
        <h2>내보낼 내용 선택</h2>
        <p className="journey-hint">
          선택한 기여 설명과 이름·역할·활동 소개가 포함됩니다. 팀 내부 문서
          본문과 다른 팀원의 평가는 포함되지 않습니다.
        </p>
        <div className="journey-selection">
          {data.records.map(record => (
            <label key={record.record_id}>
              <input
                type="checkbox"
                checked={selected.includes(record.record_id)}
                disabled={
                  !selected.includes(record.record_id) && selected.length >= 30
                }
                onChange={event =>
                  setSelected(ids =>
                    event.target.checked
                      ? [...ids, record.record_id]
                      : ids.filter(id => id !== record.record_id),
                  )
                }
              />
              <span>
                <strong>{record.title}</strong>
                <small>
                  {record.task_status} ·{' '}
                  {record.confirmation_count
                    ? `팀원 ${record.confirmation_count}명 확인`
                    : '본인 작성'}
                </small>
              </span>
            </label>
          ))}
        </div>
        {!data.records.length && (
          <p>
            팀 활동에서 작업에 결과물과 내 기여를 연결하면 여기에 나타납니다.
          </p>
        )}
        <label className="journey-check">
          <input
            type="checkbox"
            checked={includeLinks}
            onChange={event => setIncludeLinks(event.target.checked)}
          />{' '}
          결과물 링크 포함 — 외부에 보여줄 수 있는 링크인지 확인했어요
        </label>
        <label className="journey-check">
          <input
            type="checkbox"
            checked={includeReflection}
            onChange={event => setIncludeReflection(event.target.checked)}
          />{' '}
          내 회고 포함
        </label>
      </section>
      <div className="journey-section-heading">
        <h2>공유 미리보기</h2>
        <span>{selected.length}개 기록 선택</span>
      </div>
      <SnapshotView snapshot={snapshot} />
      <section className="journey-panel">
        <h2>이 내용으로 공유하기</h2>
        <p className="journey-hint">
          공유 링크에는 지금 선택한 내용이 저장됩니다. 초안을 수정해도 공개본은
          바뀌지 않으며, 다시 공유하면 이전 링크는 해제됩니다.
        </p>
        <div className="button-row">
          <button
            className="primary-button"
            disabled={action.busy || dirty || !selected.length}
            onClick={() =>
              action.run(async () => {
                await api(`${base(teamId)}/share`, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await result.reload();
              }, '미리보기 내용으로 공유 링크를 만들었습니다.')
            }
          >
            <Link2 size={17} /> 미리보기 확인·공유 링크 만들기
          </button>
          <button
            className="ghost-button"
            disabled={action.busy || dirty || !selected.length}
            onClick={exportPdf}
          >
            <Download size={17} /> 선택한 내용 PDF
          </button>
        </div>
        {data.share && (
          <>
            <CopyLink
              value={`${window.location.origin}/portfolio/shared/${data.share.token}`}
            />
            <div className="button-row">
              <Link
                className="text-link"
                target="_blank"
                rel="noreferrer"
                to={`/portfolio/shared/${data.share.token}`}
              >
                공개본 확인 <ExternalLink size={16} />
              </Link>
              <button
                className="text-link"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api(`${base(teamId)}/share`, { method: 'DELETE' });
                    await result.reload();
                  }, '공유를 해제했습니다. 이전 링크로는 열 수 없습니다.')
                }
              >
                공유 해제
              </button>
            </div>
          </>
        )}
      </section>
      {data.portfolio_id && (
        <Link className="text-link" to={`/mypage/archive/${data.portfolio_id}`}>
          기존 활동 요약·사진 편집 보기 <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

function usePrivateLinkPage() {
  useEffect(() => {
    const elements = ['robots', 'referrer'].map(name => {
      const existing = document.querySelector<HTMLMetaElement>(
        `meta[name="${name}"]`,
      );
      const element = existing || document.createElement('meta');
      const previous = element.content;
      element.name = name;
      element.content = name === 'robots' ? 'noindex, nofollow' : 'no-referrer';
      if (!existing) document.head.appendChild(element);
      return { element, existing, previous };
    });
    return () => {
      for (const { element, existing, previous } of elements) {
        if (existing) element.content = previous;
        else element.remove();
      }
    };
  }, []);
}

export function PublicPortfolioPage() {
  usePrivateLinkPage();
  const { token = '' } = useParams();
  const result = useAsync(
    () =>
      api<Snapshot>(`/api/journey/share/${token}`, {
        referrerPolicy: 'no-referrer',
      }),
    [token],
  );
  return (
    <main className="journey-public">
      <Link className="wordmark" to="/">
        끼리끼리
      </Link>
      {result.data ? (
        <>
          <SnapshotView snapshot={result.data} />
          <p className="journey-hint">
            작성자가 선택해 공개한 활동 기록입니다. 팀원 확인은 함께한 사람이
            해당 기여 내용을 확인했다는 뜻입니다.
          </p>
          <Link className="primary-button" to="/activity/new">
            우리 팀도 경험 남기기 <ArrowRight size={17} />
          </Link>
        </>
      ) : (
        <PageState loading={result.loading} error={result.error} />
      )}
    </main>
  );
}

export function NewTeamPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const action = useAction();
  return (
    <div className="journey-page journey-narrow">
      <Link className="back-link" to="/activity">
        <ArrowLeft /> 나의 활동
      </Link>
      <header className="journey-header">
        <div>
          <h1>우리 팀 활동 시작</h1>
          <p>이미 모인 팀도, 이제 함께할 팀도 바로 시작할 수 있어요.</p>
        </div>
      </header>
      <form
        className="journey-panel journey-form"
        onSubmit={event => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          action.run(async () => {
            const result = await api<{ team_id: number }>(
              '/api/journey/teams',
              {
                method: 'POST',
                body: JSON.stringify({
                  ...Object.fromEntries(values),
                  activity_id: params.get('activity') || null,
                }),
              },
            );
            navigate(`/activity/${result.team_id}/work`);
          });
        }}
      >
        <label>
          활동 이름
          <input
            name="team_name"
            defaultValue={params.get('title') || ''}
            maxLength={120}
            required
            placeholder="예: 서비스 기획 공모전 준비"
          />
        </label>
        <label>
          내 역할
          <input name="part" maxLength={100} placeholder="예: 기획 · 팀장" />
        </label>
        <div className="journey-form-row">
          <label>
            팀 정원
            <input
              name="required_members"
              type="number"
              min={2}
              max={30}
              defaultValue={5}
              required
            />
          </label>
          <label>
            목표 마감일 <span>선택</span>
            <input name="due_date" type="date" />
          </label>
        </div>
        <p className="journey-hint">
          첫 회의록과 첫 공동 작업이 준비됩니다. 팀원은 초대 링크로 합류할 수
          있어요.
        </p>
        <Feedback {...action} />
        <button className="primary-button" disabled={action.busy}>
          <UsersRound size={18} /> 팀 공간 만들기
        </button>
        <Link className="text-link" to="/matching">
          함께할 팀원부터 찾기 <ArrowRight size={16} />
        </Link>
      </form>
    </div>
  );
}

export function JoinTeamPage() {
  usePrivateLinkPage();
  const { token = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  const result = useAsync(
    () =>
      api<{ team_name: string; due_date: string; required_members: number }>(
        `/api/journey/invite/${token}`,
        { referrerPolicy: 'no-referrer' },
      ),
    [token],
  );
  return (
    <main className="journey-public journey-narrow">
      <Link className="wordmark" to="/">
        끼리끼리
      </Link>
      {!result.data ? (
        <PageState loading={result.loading} error={result.error} />
      ) : (
        <section className="journey-panel">
          <span className="journey-status">팀 초대</span>
          <h1>{result.data.team_name}</h1>
          <p>
            목표 마감 {date(result.data.due_date)} · 정원{' '}
            {result.data.required_members}명
          </p>
          <Feedback {...action} />
          {user ? (
            <form
              className="journey-form"
              onSubmit={event => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                action.run(async () => {
                  const response = await api<{ team_id: number }>(
                    `/api/journey/invite/${token}/accept`,
                    {
                      method: 'POST',
                      body: JSON.stringify({ part: values.get('part') }),
                    },
                  );
                  navigate(`/activity/${response.team_id}/work`);
                });
              }}
            >
              <label>
                내가 맡을 역할 <span>선택</span>
                <input
                  name="part"
                  maxLength={100}
                  placeholder="합류 후에도 바꿀 수 있어요."
                />
              </label>
              <button className="primary-button" disabled={action.busy}>
                합류하고 공동 작업 시작 <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <Link
              className="primary-button"
              to="/login"
              state={{ from: `/join/${token}` }}
            >
              로그인하고 합류하기
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
