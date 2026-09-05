import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  Check,
  CheckSquare,
  ChevronRight,
  Cloud,
  CloudOff,
  Code2,
  Eye,
  FilePlus2,
  Files,
  Heading2,
  Link2,
  List,
  LoaderCircle,
  PencilLine,
  Quote,
  RefreshCw,
  Save,
  Search,
  SplitSquareHorizontal,
  Table2,
  Trash2,
} from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Link, useNavigate, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { ApiError, api } from '../shared/api/client';
import type { ActivityDocument, TeamSummary } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import '../activity-documents.css';

type EditorMode = 'edit' | 'split' | 'preview';
type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';
type TeamGeneration = { teamId: number; generation: number };
type ApiDocument = Omit<ActivityDocument, 'content_markdown'> & {
  content_markdown?: string;
  markdown_content?: string;
};

const DEFAULT_DOCUMENT = '# 새 문서\n\n활동 기록을 작성해보세요.';
const DRAFT_STORAGE_PREFIX = 'kkiri-activity-document-draft';

const normalizeDocument = (document: ApiDocument): ActivityDocument => ({
  ...document,
  content_markdown: document.content_markdown ?? document.markdown_content ?? '',
});

const dateTime = (value?: string) => value
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '';

const saveStateCopy: Record<SaveState, { label: string }> = {
  saved: { label: '모든 변경사항 저장됨' },
  dirty: { label: '저장 대기 중' },
  saving: { label: '저장 중' },
  conflict: { label: '편집 충돌' },
  error: { label: '저장 실패' },
};

function SaveStateIcon({ state }: { state: SaveState }) {
  if (state === 'saved') return <Check />;
  if (state === 'dirty') return <Cloud />;
  if (state === 'saving') return <LoaderCircle className="spin" />;
  if (state === 'conflict') return <AlertTriangle />;
  return <CloudOff />;
}

const draftStorageKey = (document: Pick<ActivityDocument, 'team_id' | 'document_id'>) => `${DRAFT_STORAGE_PREFIX}:${document.team_id}:${document.document_id}`;

const storeDraft = (document: ActivityDocument) => {
  try {
    sessionStorage.setItem(draftStorageKey(document), JSON.stringify({
      title: document.title,
      content_markdown: document.content_markdown,
      version: document.version,
    }));
  } catch {
    // Storage can be disabled by the browser; autosave remains the primary path.
  }
};

const clearStoredDraft = (document: Pick<ActivityDocument, 'team_id' | 'document_id'>) => {
  try { sessionStorage.removeItem(draftStorageKey(document)); } catch { /* Ignore unavailable storage. */ }
};

const readStoredDraft = (document: ActivityDocument) => {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(document));
    if (!raw) return null;
    const value = JSON.parse(raw) as { title?: unknown; content_markdown?: unknown; version?: unknown };
    if (typeof value.title !== 'string' || typeof value.content_markdown !== 'string' || typeof value.version !== 'number') return null;
    if (value.title === document.title && value.content_markdown === document.content_markdown) {
      clearStoredDraft(document);
      return null;
    }
    return value as Pick<ActivityDocument, 'title' | 'content_markdown' | 'version'>;
  } catch {
    return null;
  }
};

function SafeMarkdownLink({ href, children }: React.ComponentPropsWithoutRef<'a'>) {
  const safe = !href
    || (href.startsWith('/') && !href.startsWith('//'))
    || href.startsWith('./')
    || href.startsWith('../')
    || href.startsWith('#')
    || /^https?:\/\//i.test(href)
    || /^mailto:/i.test(href);
  if (!safe) return <span>{children}</span>;
  const external = /^https?:\/\//i.test(href || '');
  return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}</a>;
}

export function ActivityDocumentsPage() {
  const { teamId: teamIdParam } = useParams();
  const teamId = Number(teamIdParam);
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [documents, setDocuments] = useState<ActivityDocument[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ActivityDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<EditorMode>('split');
  const [loading, setLoading] = useState(true);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [draftCopied, setDraftCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<ActivityDocument | null>(null);
  const documentsRef = useRef<ActivityDocument[]>([]);
  const selectedIdRef = useRef<number | null>(null);
  const saveStateRef = useRef<SaveState>('saved');
  const savingRef = useRef(false);
  const creatingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const saveOperationRef = useRef(0);
  const teamGenerationRef = useRef<TeamGeneration>({ teamId, generation: 0 });
  const deleteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const deletingIdsRef = useRef(new Set<number>());
  const documentRequestRef = useRef(0);
  const deferredMarkdown = useDeferredValue(draft?.content_markdown ?? '');

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);

  const isCurrentGeneration = useCallback((context: TeamGeneration) => {
    const current = teamGenerationRef.current;
    return Object.is(current.teamId, context.teamId) && current.generation === context.generation;
  }, []);

  const replaceDocuments = useCallback((next: ActivityDocument[]) => {
    documentsRef.current = next;
    setDocuments(next);
  }, []);

  const updateDocuments = useCallback((updater: (current: ActivityDocument[]) => ActivityDocument[]) => {
    const next = updater(documentsRef.current);
    documentsRef.current = next;
    setDocuments(next);
    return next;
  }, []);

  useLayoutEffect(() => {
    const previous = teamGenerationRef.current;
    if (Object.is(previous.teamId, teamId)) return;
    if (draftRef.current && ['dirty', 'saving', 'conflict', 'error'].includes(saveStateRef.current)) {
      storeDraft(draftRef.current);
    }
    teamGenerationRef.current = { teamId, generation: previous.generation + 1 };
    documentRequestRef.current += 1;
    saveOperationRef.current += 1;
    savingRef.current = false;
    creatingRef.current = false;
    queuedSaveRef.current = false;
    deleteQueueRef.current = Promise.resolve();
    deletingIdsRef.current = new Set();
    documentsRef.current = [];
    selectedIdRef.current = null;
    draftRef.current = null;
    setTeam(null);
    setDocuments([]);
    setSelectedId(null);
    setDraft(null);
    setSaveState('saved');
    saveStateRef.current = 'saved';
    setSaveError('');
    setPageError('');
    setDocumentLoading(false);
    setCreating(false);
    setLoading(true);
  }, [teamId]);

  const openDocument = useCallback((document: ActivityDocument | null, ignoreStoredDraft = false, context = teamGenerationRef.current) => {
    if (!isCurrentGeneration(context) || (document && document.team_id !== context.teamId)) return;
    const stored = document && !ignoreStoredDraft ? readStoredDraft(document) : null;
    if (document && ignoreStoredDraft) clearStoredDraft(document);
    const nextDocument = document && stored ? { ...document, ...stored } : document;
    setSelectedId(document?.document_id ?? null);
    selectedIdRef.current = document?.document_id ?? null;
    setDraft(nextDocument ? { ...nextDocument } : null);
    draftRef.current = nextDocument ? { ...nextDocument } : null;
    setSaveError(stored ? '브라우저에 남아 있던 저장 전 초안을 복구했습니다.' : '');
    setDraftCopied(false);
    const nextState: SaveState = stored ? 'dirty' : 'saved';
    setSaveState(nextState);
    saveStateRef.current = nextState;
  }, [isCurrentGeneration]);

  const loadDocuments = useCallback(async (preferredId?: number) => {
    const context = { ...teamGenerationRef.current };
    if (!Object.is(context.teamId, teamId) || !isCurrentGeneration(context)) return;
    if (!Number.isSafeInteger(teamId) || teamId <= 0) {
      setPageError('올바르지 않은 활동 주소입니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError('');
    const requestId = ++documentRequestRef.current;
    try {
      const [teams, result] = await Promise.all([
        api<TeamSummary[]>('/my-teams'),
        api<ApiDocument[]>(`/teams/${teamId}/documents`),
      ]);
      if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
      let nextDocuments = result.map(normalizeDocument);
      setTeam(teams.find((item) => item.team_id === teamId) ?? null);
      const nextId = preferredId ?? selectedIdRef.current;
      const selectedMeta = nextDocuments.find((item) => item.document_id === nextId) ?? nextDocuments[0] ?? null;
      if (selectedMeta) {
        const detail = normalizeDocument(await api<ApiDocument>(`/teams/${teamId}/documents/${selectedMeta.document_id}`));
        if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
        const selectedDocument = { ...selectedMeta, ...detail };
        nextDocuments = nextDocuments.map((item) => item.document_id === selectedDocument.document_id ? selectedDocument : item);
        replaceDocuments(nextDocuments);
        openDocument(selectedDocument, false, context);
      } else {
        replaceDocuments([]);
        openDocument(null, false, context);
      }
    } catch (reason) {
      if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
      setPageError(reason instanceof Error ? reason.message : '문서를 불러오지 못했습니다.');
    } finally {
      if (isCurrentGeneration(context) && requestId === documentRequestRef.current) setLoading(false);
    }
  }, [isCurrentGeneration, openDocument, replaceDocuments, teamId]);

  // 팀이 바뀔 때만 새 목록과 선택 문서를 가져옵니다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDocuments(); }, [teamId]);

  const saveDraft = useCallback(async (snapshot = draftRef.current) => {
    if (!snapshot) return false;
    const context = { ...teamGenerationRef.current };
    if (snapshot.team_id !== context.teamId || !isCurrentGeneration(context)) return false;
    if (savingRef.current) {
      queuedSaveRef.current = true;
      return false;
    }
    const operationId = ++saveOperationRef.current;
    savingRef.current = true;
    setSaveState('saving');
    saveStateRef.current = 'saving';
    setSaveError('');
    try {
      const requestSnapshot = { ...snapshot, title: snapshot.title.trim() || '제목 없는 문서' };
      const result = await api<ApiDocument>(`/teams/${snapshot.team_id}/documents/${snapshot.document_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: requestSnapshot.title,
          content_markdown: requestSnapshot.content_markdown,
          version: requestSnapshot.version,
        }),
      });
      if (!isCurrentGeneration(context) || operationId !== saveOperationRef.current) return false;
      const saved = normalizeDocument(result);
      const nextVersion = saved.version ?? requestSnapshot.version + 1;
      updateDocuments((current) => current.map((item) => item.document_id === snapshot.document_id
        ? { ...item, ...saved, content_markdown: requestSnapshot.content_markdown, version: nextVersion }
        : item));
      const latestDraft = draftRef.current;
      let currentSnapshotSaved = true;
      if (latestDraft?.document_id === snapshot.document_id) {
        const unchanged = latestDraft.title === snapshot.title
          && latestDraft.content_markdown === snapshot.content_markdown;
        currentSnapshotSaved = unchanged;
        const nextDraft = {
          ...latestDraft,
          title: unchanged ? saved.title : latestDraft.title,
          version: nextVersion,
          updated_at: saved.updated_at || latestDraft.updated_at,
        };
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        const nextState: SaveState = unchanged ? 'saved' : 'dirty';
        setSaveState(nextState);
        saveStateRef.current = nextState;
        if (unchanged) clearStoredDraft(nextDraft);
      }
      return currentSnapshotSaved;
    } catch (reason) {
      if (!isCurrentGeneration(context) || operationId !== saveOperationRef.current) return false;
      const conflict = reason instanceof ApiError && (reason.status === 409 || reason.code === 'DOCUMENT_VERSION_CONFLICT');
      const nextState: SaveState = conflict ? 'conflict' : 'error';
      setSaveState(nextState);
      saveStateRef.current = nextState;
      setSaveError(conflict
        ? '다른 팀원이 이 문서를 먼저 저장했습니다. 내 내용을 보존한 뒤 최신 버전을 불러오세요.'
        : reason instanceof Error ? reason.message : '문서를 저장하지 못했습니다.');
      return false;
    } finally {
      if (isCurrentGeneration(context) && operationId === saveOperationRef.current) {
        savingRef.current = false;
        const shouldRunQueuedSave = queuedSaveRef.current && saveStateRef.current === 'dirty';
        queuedSaveRef.current = false;
        if (shouldRunQueuedSave) {
          window.setTimeout(() => { saveDraft(draftRef.current); }, 0);
        }
      }
    }
  }, [isCurrentGeneration, updateDocuments]);

  useEffect(() => {
    if (saveState !== 'dirty' || !draftRef.current) return undefined;
    const timer = window.setTimeout(() => { saveDraft(); }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, saveDraft, saveState]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!['dirty', 'saving', 'conflict', 'error'].includes(saveStateRef.current)) return;
      if (draftRef.current) storeDraft(draftRef.current);
      event.preventDefault();
    };
    const backupBeforeHistoryChange = () => {
      if (draftRef.current && ['dirty', 'saving', 'conflict', 'error'].includes(saveStateRef.current)) storeDraft(draftRef.current);
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    window.addEventListener('popstate', backupBeforeHistoryChange);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      window.removeEventListener('popstate', backupBeforeHistoryChange);
    };
  }, []);

  useEffect(() => {
    if (saveState !== 'dirty' || !draft) return undefined;
    const timer = window.setTimeout(() => storeDraft(draft), 180);
    return () => window.clearTimeout(timer);
  }, [draft, saveState]);

  const updateDraft = (changes: Partial<Pick<ActivityDocument, 'title' | 'content_markdown'>>) => {
    if (!draftRef.current || deletingIdsRef.current.has(draftRef.current.document_id)) return;
    // 로컬 입력은 진행 중인 reload/create보다 최신 사용자 의도입니다.
    documentRequestRef.current += 1;
    setLoading(false);
    setDocumentLoading(false);
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...changes };
      draftRef.current = next;
      return next;
    });
    if ('title' in changes) {
      updateDocuments((current) => current.map((item) => item.document_id === selectedIdRef.current ? { ...item, ...changes } : item));
    }
    setSaveState('dirty');
    saveStateRef.current = 'dirty';
    setSaveError('');
  };

  const selectDocument = async (document: ActivityDocument) => {
    if (document.document_id === selectedIdRef.current) return;
    if (document.team_id !== teamGenerationRef.current.teamId) return;
    if (deletingIdsRef.current.has(document.document_id)) return;
    if (saveStateRef.current === 'saving') return;
    if (saveStateRef.current === 'dirty') {
      const saved = await saveDraft();
      if (!saved) return;
    } else if (['conflict', 'error'].includes(saveStateRef.current)) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('저장되지 않은 변경사항을 버리고 다른 문서로 이동할까요?')) return;
      if (draftRef.current) clearStoredDraft(draftRef.current);
    }
    const context = { ...teamGenerationRef.current };
    if (document.team_id !== context.teamId || !isCurrentGeneration(context)) return;
    setDocumentLoading(true);
    setPageError('');
    const requestId = ++documentRequestRef.current;
    try {
      const detail = normalizeDocument(await api<ApiDocument>(`/teams/${teamId}/documents/${document.document_id}`));
      if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current
        || deletingIdsRef.current.has(document.document_id)
        || !documentsRef.current.some((item) => item.document_id === document.document_id)) return;
      const selectedDocument = { ...document, ...detail };
      updateDocuments((current) => current.map((item) => item.document_id === document.document_id ? selectedDocument : item));
      openDocument(selectedDocument, false, context);
    } catch (reason) {
      if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
      setPageError(reason instanceof Error ? reason.message : '문서를 불러오지 못했습니다.');
    } finally {
      if (isCurrentGeneration(context) && requestId === documentRequestRef.current) setDocumentLoading(false);
    }
  };

  const createDocument = async () => {
    if (saveStateRef.current === 'saving' || creatingRef.current || deletingIdsRef.current.size > 0) return;
    if (saveStateRef.current === 'dirty' && !(await saveDraft())) return;
    const preserveDraft = draftRef.current && ['conflict', 'error'].includes(saveStateRef.current);
    const draftToPreserve = preserveDraft ? draftRef.current : null;
    if (preserveDraft) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('저장되지 않은 현재 초안을 복구 문서로 보존하고 새 문서를 만들까요?')) return;
    }
    const context = { ...teamGenerationRef.current };
    if (!isCurrentGeneration(context)) return;
    // 선택/삭제 후 실행 중인 상세 조회가 새 문서를 다시 덮어쓰지 못하게 무효화합니다.
    const requestId = ++documentRequestRef.current;
    setDocumentLoading(false);
    setLoading(false);
    creatingRef.current = true;
    setCreating(true);
    setPageError('');
    try {
      const result = await api<ApiDocument>(`/teams/${context.teamId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          title: draftToPreserve ? `${draftToPreserve.title || '제목 없는 문서'} (복구본)`.slice(0, 160) : '제목 없는 문서',
          content_markdown: draftToPreserve ? draftToPreserve.content_markdown : DEFAULT_DOCUMENT,
        }),
      });
      if (!isCurrentGeneration(context)) return;
      const created = normalizeDocument(result);
      if (draftToPreserve) clearStoredDraft(draftToPreserve);
      updateDocuments((current) => [created, ...current.filter((item) => item.document_id !== created.document_id)]);
      if (requestId !== documentRequestRef.current) return;
      openDocument(created, false, context);
      window.requestAnimationFrame(() => {
        if (isCurrentGeneration(context) && requestId === documentRequestRef.current) textareaRef.current?.focus();
      });
    } catch (reason) {
      if (!isCurrentGeneration(context)) return;
      setPageError(reason instanceof Error ? reason.message : '새 문서를 만들지 못했습니다.');
    } finally {
      if (isCurrentGeneration(context)) {
        creatingRef.current = false;
        setCreating(false);
      }
    }
  };

  const deleteDocument = async (document: ActivityDocument) => {
    if (document.team_id !== teamGenerationRef.current.teamId || deletingIdsRef.current.has(document.document_id)) return;
    let target = document;
    if (document.document_id === selectedIdRef.current) {
      if (saveStateRef.current === 'saving') return;
      if (saveStateRef.current === 'dirty') {
        if (!(await saveDraft())) return;
        target = draftRef.current ?? document;
      }
      if (['conflict', 'error'].includes(saveStateRef.current)) {
        setSaveError('저장되지 않은 초안을 보존하거나 최신본을 불러온 뒤 삭제해주세요.');
        return;
      }
    }
    // eslint-disable-next-line no-alert
    if (!window.confirm(`“${target.title || '제목 없는 문서'}” 문서를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    const context = { ...teamGenerationRef.current };
    if (target.team_id !== context.teamId || !isCurrentGeneration(context)) return;
    const deletingIds = deletingIdsRef.current;
    deletingIds.add(target.document_id);

    const runDelete = async () => {
      let replacesSelection = false;
      let deletionIntentId = 0;
      try {
        if (!isCurrentGeneration(context)) return;
        replacesSelection = selectedIdRef.current === target.document_id;
        deletionIntentId = ++documentRequestRef.current;
        setDocumentLoading(false);
        setLoading(false);
        await api(`/teams/${context.teamId}/documents/${target.document_id}`, {
          method: 'DELETE',
          body: JSON.stringify({ version: target.version }),
        });
        if (!isCurrentGeneration(context)) return;
        const remaining = updateDocuments((current) => current.filter((item) => item.document_id !== target.document_id));
        clearStoredDraft(target);
        setPageError('');
        if (replacesSelection && deletionIntentId === documentRequestRef.current
          && selectedIdRef.current === target.document_id) {
          // 목록 메타에는 본문이 없으므로 최신 remaining의 첫 항목을 상세 조회해 엽니다.
          openDocument(null, false, context);
          const nextMeta = remaining.find((item) => !deletingIds.has(item.document_id));
          if (nextMeta) {
            setDocumentLoading(true);
            const requestId = ++documentRequestRef.current;
            try {
              const detail = normalizeDocument(await api<ApiDocument>(`/teams/${context.teamId}/documents/${nextMeta.document_id}`));
              if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current
                || deletingIds.has(nextMeta.document_id)
                || !documentsRef.current.some((item) => item.document_id === nextMeta.document_id)) return;
              const nextDocument = { ...nextMeta, ...detail };
              updateDocuments((current) => current.map((item) => item.document_id === nextDocument.document_id ? nextDocument : item));
              openDocument(nextDocument, false, context);
            } catch (reason) {
              if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
              setPageError(reason instanceof Error ? reason.message : '다음 문서를 불러오지 못했습니다.');
            } finally {
              if (isCurrentGeneration(context) && requestId === documentRequestRef.current) setDocumentLoading(false);
            }
          }
        }
      } catch (reason) {
        if (!isCurrentGeneration(context)) return;
        const conflict = reason instanceof ApiError && (reason.status === 409 || reason.code === 'DOCUMENT_VERSION_CONFLICT');
        const message = conflict
          ? '다른 팀원이 문서를 수정해 삭제하지 못했습니다. 최신 목록을 불러오세요.'
          : reason instanceof Error ? reason.message : '문서를 삭제하지 못했습니다.';
        if (replacesSelection && deletionIntentId === documentRequestRef.current
          && selectedIdRef.current === target.document_id) {
          setSaveError(message);
          if (conflict) {
            setSaveState('conflict');
            saveStateRef.current = 'conflict';
          }
        } else {
          setPageError(message);
        }
      } finally {
        deletingIds.delete(target.document_id);
      }
    };

    const queuedDelete = deleteQueueRef.current.then(runDelete, runDelete);
    deleteQueueRef.current = queuedDelete;
    await queuedDelete;
  };

  const reloadConflictedDocument = async () => {
    const documentId = selectedIdRef.current;
    const context = { ...teamGenerationRef.current };
    if (!documentId || !isCurrentGeneration(context)) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('서버의 최신본을 불러오면 화면의 로컬 초안이 대체됩니다. 계속할까요?')) return;
    setLoading(true);
    const requestId = ++documentRequestRef.current;
    try {
      const result = await api<ApiDocument>(`/teams/${context.teamId}/documents/${documentId}`);
      if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
      const latest = normalizeDocument(result);
      updateDocuments((current) => current.map((item) => item.document_id === documentId ? latest : item));
      openDocument(latest, true, context);
    } catch (reason) {
      if (!isCurrentGeneration(context) || requestId !== documentRequestRef.current) return;
      setSaveError(reason instanceof Error ? reason.message : '최신 문서를 불러오지 못했습니다.');
    } finally {
      if (isCurrentGeneration(context) && requestId === documentRequestRef.current) setLoading(false);
    }
  };

  const copyLocalDraft = async () => {
    if (!draftRef.current) return;
    try {
      await navigator.clipboard.writeText(`${draftRef.current.title}\n\n${draftRef.current.content_markdown}`);
      setDraftCopied(true);
    } catch {
      setSaveError('클립보드에 복사하지 못했습니다. 편집기에서 직접 내용을 복사해주세요.');
    }
  };

  const insertMarkdown = (kind: 'heading' | 'bold' | 'list' | 'check' | 'quote' | 'code' | 'link' | 'table') => {
    if (!draft) return;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.content_markdown.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = draft.content_markdown.slice(start, end);
    let insertion = '';
    let selectionOffset = 0;
    let selectionLength = 0;
    if (kind === 'heading') insertion = `## ${selected || '제목'}`;
    if (kind === 'bold') {
      insertion = `**${selected || '강조할 내용'}**`;
      selectionOffset = 2;
      selectionLength = selected.length || 6;
    }
    if (kind === 'list') insertion = (selected || '목록 항목').split('\n').map((line) => `- ${line}`).join('\n');
    if (kind === 'check') insertion = (selected || '할 일').split('\n').map((line) => `- [ ] ${line}`).join('\n');
    if (kind === 'quote') insertion = (selected || '인용문').split('\n').map((line) => `> ${line}`).join('\n');
    if (kind === 'code') insertion = selected.includes('\n') ? `\n\`\`\`\n${selected || '코드'}\n\`\`\`\n` : `\`${selected || '코드'}\``;
    if (kind === 'link') {
      insertion = `[${selected || '링크 제목'}](https://)`;
      selectionOffset = insertion.lastIndexOf('https://');
      selectionLength = 8;
    }
    if (kind === 'table') insertion = '\n| 항목 | 담당자 | 상태 |\n| --- | --- | --- |\n| 예시 | 이름 | 진행 중 |\n';
    const next = `${draft.content_markdown.slice(0, start)}${insertion}${draft.content_markdown.slice(end)}`;
    updateDraft({ content_markdown: next });
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const nextStart = start + selectionOffset;
      textarea?.setSelectionRange(nextStart, nextStart + (selectionLength || insertion.length));
    });
  };

  useEffect(() => {
    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target || target.target === '_blank') return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (saveStateRef.current === 'saving') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (saveStateRef.current === 'dirty') {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveDraft().then((saved) => {
          if (saved) navigate(`${destination.pathname}${destination.search}${destination.hash}`);
        });
        return;
      }
      if (['conflict', 'error'].includes(saveStateRef.current)) {
        // eslint-disable-next-line no-alert
        if (!window.confirm('저장되지 않은 초안을 버리고 다른 화면으로 이동할까요?')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (draftRef.current) {
          clearStoredDraft(draftRef.current);
        }
      }
    };
    window.addEventListener('click', guardInternalNavigation, true);
    return () => window.removeEventListener('click', guardInternalNavigation, true);
  }, [navigate, saveDraft]);

  const retryLoadDocuments = async () => {
    const context = { ...teamGenerationRef.current };
    if (!isCurrentGeneration(context)) return;
    if (saveStateRef.current === 'saving' || creatingRef.current || deletingIdsRef.current.size > 0) return;
    if (saveStateRef.current === 'dirty' && !(await saveDraft())) return;
    if (!isCurrentGeneration(context)) return;
    if (['conflict', 'error'].includes(saveStateRef.current)) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('저장되지 않은 초안을 버리고 문서 목록을 다시 불러올까요?')) return;
      if (draftRef.current) clearStoredDraft(draftRef.current);
    }
    if (!isCurrentGeneration(context)) return;
    await loadDocuments(selectedIdRef.current ?? undefined);
  };

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ko-KR');
    if (!query) return documents;
    return documents.filter((document) => document.title.toLocaleLowerCase('ko-KR').includes(query));
  }, [documents, searchQuery]);

  if (loading && !documents.length) return <PageState loading />;
  if (pageError && !documents.length) return <PageState error={pageError} />;

  return <div className="activity-documents-page">
    <header className="document-page-header">
      <div>
        <Link className="back-link" to={`/activity?team=${teamId}`}><ArrowLeft /> 활동으로 돌아가기</Link>
        <span className="eyebrow">ACTIVITY DOCUMENTS</span>
        <h1>{team?.team_name || '활동 문서'}</h1>
        <p>아이디어, 회의록, 조사 자료를 Markdown으로 함께 작성하고 활동별로 보관하세요.</p>
      </div>
      <button className="primary-button document-create-top" onClick={() => { createDocument(); }} disabled={creating}>
        {creating ? <LoaderCircle className="spin" /> : <FilePlus2 />} 새 문서
      </button>
    </header>

    {pageError && <div className="document-inline-alert error" role="alert"><CloudOff /><span>{pageError}</span><button type="button" onClick={() => { retryLoadDocuments(); }} disabled={creating}>다시 시도</button></div>}

    <div className="document-workspace">
      <aside className="document-sidebar" aria-label="활동 문서 목록">
        <div className="document-sidebar-title"><div><Files /><strong>문서</strong></div><span>{documents.length}</span></div>
        <label className="document-search"><Search /><span className="sr-only">문서 검색</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="문서 제목 검색" /></label>
        <div className="document-list">
          {filteredDocuments.map((document) => <div className={`document-list-item ${document.document_id === selectedId ? 'active' : ''}`} key={document.document_id}>
            <button className="document-select" onClick={() => { selectDocument(document); }} aria-current={document.document_id === selectedId ? 'page' : undefined}>
              <PencilLine />
              <span><strong>{document.title || '제목 없는 문서'}</strong><small>{dateTime(document.updated_at)} · v{document.version}</small></span>
              <ChevronRight />
            </button>
            <button className="document-delete" aria-label={`${document.title || '제목 없는 문서'} 삭제`} onClick={() => { deleteDocument(document); }}><Trash2 /></button>
          </div>)}
          {!filteredDocuments.length && <div className="document-list-empty"><Files /><p>{documents.length ? '검색 결과가 없습니다.' : '첫 문서를 만들어보세요.'}</p>{!documents.length && <button onClick={() => { createDocument(); }}>새 문서 만들기</button>}</div>}
        </div>
      </aside>

      <section className="document-editor-shell" aria-label="활동 문서 편집 영역">
        {documentLoading ? <div className="document-editor-empty"><LoaderCircle className="spin" /><h2>문서를 불러오는 중입니다</h2></div> : !draft ? <div className="document-editor-empty"><Files /><h2>작성할 문서를 선택하세요</h2><p>활동의 모든 기록을 팀원과 같은 공간에서 관리할 수 있습니다.</p><button className="primary-button" onClick={() => { createDocument(); }}><FilePlus2 /> 첫 문서 만들기</button></div> : <>
          <div className="document-editor-head">
            <input className="document-title-input" value={draft.title} maxLength={160} onChange={(event) => updateDraft({ title: event.target.value })} aria-label="문서 제목" placeholder="문서 제목" />
            <div className="document-save-meta">
              <span className={`document-save-state ${saveState}`} role="status" aria-live="polite"><SaveStateIcon state={saveState} />{saveStateCopy[saveState].label}</span>
              <button onClick={() => { saveDraft(); }} disabled={saveState === 'saving' || saveState === 'saved' || saveState === 'conflict'} aria-label="지금 저장"><Save /> 저장</button>
            </div>
          </div>

          {saveError && <div className={`document-inline-alert ${saveState === 'conflict' ? 'conflict' : saveState === 'dirty' ? 'recovered' : 'error'}`} role="alert">
            <AlertTriangle /><span>{saveError}</span>
            {saveState === 'conflict' && <div className="document-alert-actions"><button type="button" onClick={() => { copyLocalDraft(); }}><Files /> {draftCopied ? '초안 복사됨' : '내 초안 복사'}</button><button type="button" onClick={() => { createDocument(); }}><FilePlus2 /> 복구본 만들기</button><button type="button" onClick={() => { reloadConflictedDocument(); }}><RefreshCw /> 최신본 불러오기</button></div>}
            {saveState === 'error' && <button onClick={() => { saveDraft(); }}><RefreshCw /> 다시 저장</button>}
          </div>}

          <div className="document-toolbar-row">
            <div className="markdown-toolbar" role="toolbar" aria-label="Markdown 서식 도구">
              <button type="button" onClick={() => insertMarkdown('heading')} aria-label="제목 추가" title="제목"><Heading2 /></button>
              <button type="button" onClick={() => insertMarkdown('bold')} aria-label="굵게" title="굵게"><Bold /></button>
              <button type="button" onClick={() => insertMarkdown('list')} aria-label="글머리 기호 목록" title="목록"><List /></button>
              <button type="button" onClick={() => insertMarkdown('check')} aria-label="체크리스트" title="체크리스트"><CheckSquare /></button>
              <button type="button" onClick={() => insertMarkdown('quote')} aria-label="인용문" title="인용문"><Quote /></button>
              <button type="button" onClick={() => insertMarkdown('code')} aria-label="코드" title="코드"><Code2 /></button>
              <button type="button" onClick={() => insertMarkdown('link')} aria-label="링크" title="링크"><Link2 /></button>
              <button type="button" onClick={() => insertMarkdown('table')} aria-label="표 템플릿" title="표"><Table2 /></button>
            </div>
            <div className="document-mode-switch" role="group" aria-label="편집 화면 모드">
              <button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')} aria-pressed={mode === 'edit'}><PencilLine /> 편집</button>
              <button type="button" className={mode === 'split' ? 'active' : ''} onClick={() => setMode('split')} aria-pressed={mode === 'split'}><SplitSquareHorizontal /> 분할</button>
              <button type="button" className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')} aria-pressed={mode === 'preview'}><Eye /> 미리보기</button>
            </div>
          </div>

          <div className={`document-canvas mode-${mode}`}>
            {mode !== 'preview' && <section className="document-editor-pane" aria-label="Markdown 편집기">
              <div className="document-pane-label"><PencilLine /> Markdown</div>
              <textarea ref={textareaRef} value={draft.content_markdown} onChange={(event) => updateDraft({ content_markdown: event.target.value })} spellCheck="true" aria-label="Markdown 본문" placeholder="# 문서 제목&#10;&#10;내용을 작성하세요." />
            </section>}
            {mode !== 'edit' && <section className="document-preview-pane" aria-label="Markdown 미리보기">
              <div className="document-pane-label"><Eye /> 미리보기</div>
              <article className="markdown-preview">
                {deferredMarkdown.trim() ? <Markdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  disallowedElements={['img']}
                  components={{
                    a: SafeMarkdownLink,
                  }}
                >{deferredMarkdown}</Markdown> : <p className="markdown-empty">내용을 입력하면 여기에 안전하게 미리보기가 표시됩니다.</p>}
              </article>
            </section>}
          </div>

          <footer className="document-editor-footer">
            <span>Markdown · GFM 표, 체크리스트, 코드 지원</span>
            <span>{draft.editor_name || draft.creator_name ? `최근 편집 ${draft.editor_name || draft.creator_name} · ` : ''}{dateTime(draft.updated_at)} · 버전 {draft.version}</span>
          </footer>
        </>}
      </section>
    </div>
  </div>;
}
