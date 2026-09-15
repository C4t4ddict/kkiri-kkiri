import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Archive, ArrowDown, ArrowUp, Bell, BookOpen, CalendarDays, FileHeart, FolderOpen, Heart, Mail, Send, UsersRound, X } from 'lucide-react';
import { defaultShortcuts, moveShortcut, normalizeShortcuts, shortcutIds, type ShortcutId } from './shortcutPreferences';

const menus = {
  notifications: { label: '알림', to: '/notifications', icon: Bell },
  favorites: { label: '관심 활동', to: '/info/favorites', icon: Heart },
  applications: { label: '나의 지원', to: '/matching/applications', icon: Send },
  templates: { label: '지원서', to: '/matching/applications/templates', icon: FileHeart },
  friends: { label: '친구 목록', to: '/friends', icon: UsersRound },
  messages: { label: '쪽지함', to: '/messages', icon: Mail },
  curriculum: { label: '커리큘럼', to: '/curriculum', icon: BookOpen },
  portfolio: { label: '포트폴리오', to: '/activity/portfolios', icon: FolderOpen },
  archive: { label: '지난 활동', to: '/activity/archive', icon: Archive },
  activity: { label: '활동', to: '/activity', icon: Activity },
  matching: { label: '매칭', to: '/matching', icon: UsersRound },
  calendar: { label: '캘린더', to: '/calendar', icon: CalendarDays },
};

export function HomeShortcuts({ userId, counts }: { userId?: number; counts: Partial<Record<ShortcutId, number>> }) {
  const key = `kkiri_home_shortcuts_v1_${userId || 'guest'}`;
  const [selected, setSelected] = useState<ShortcutId[]>(() => {
    try { return normalizeShortcuts(JSON.parse(localStorage.getItem(key) || 'null')); }
    catch { return [...defaultShortcuts]; }
  });
  const [draft, setDraft] = useState<ShortcutId[] | null>(null);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (draft && !dialog.current?.open) dialog.current?.showModal(); }, [draft]);
  const close = () => { dialog.current?.close(); setDraft(null); };
  const save = () => {
    if (!draft?.length) return;
    setSelected(draft);
    try { localStorage.setItem(key, JSON.stringify(draft)); setMessage('바로가기를 저장했습니다.'); }
    catch { setMessage('이 브라우저는 저장을 차단했습니다. 이번 화면에만 적용됩니다.'); }
    close();
  };
  return <>
    <div className="home-profile-shortcuts"><header><h2>바로가기</h2><button type="button" onClick={() => setDraft([...selected])}>편집</button></header>
      <div>{selected.map(id => { const item = menus[id]; const Icon = item.icon; const count = counts[id]; return <Link key={id} to={item.to}><Icon /><span>{item.label}</span>{Boolean(count) && <em>{count! > 99 ? '99+' : count}</em>}</Link>; })}</div>
      {message && <p className="shortcut-save-message" role="status">{message}</p>}
    </div>
    <dialog ref={dialog} className="shortcut-dialog" aria-labelledby="shortcut-title" onCancel={close} onClose={() => setDraft(null)}>
      <header><h2 id="shortcut-title">바로가기 편집</h2><button type="button" onClick={close} aria-label="닫기"><X /></button></header>
      <p>자주 쓰는 메뉴를 고르고, 화살표로 순서를 바꿔보세요.</p>
      <ol>{draft?.map((id, index) => <li key={id}><span>{index + 1}</span><strong>{menus[id].label}</strong><button type="button" disabled={index === 0} aria-label={`${menus[id].label} 앞으로`} onClick={() => setDraft(moveShortcut(draft, index, -1))}><ArrowUp /></button><button type="button" disabled={index === draft.length - 1} aria-label={`${menus[id].label} 뒤로`} onClick={() => setDraft(moveShortcut(draft, index, 1))}><ArrowDown /></button><button type="button" aria-label={`${menus[id].label} 제거`} onClick={() => setDraft(draft.filter(value => value !== id))}><X /></button></li>)}</ol>
      <fieldset><legend>메뉴 선택</legend>{shortcutIds.map(id => <label key={id}><input type="checkbox" checked={draft?.includes(id) || false} onChange={event => setDraft(current => event.target.checked ? [...(current || []), id] : (current || []).filter(value => value !== id))} />{menus[id].label}</label>)}</fieldset>
      <footer><button type="button" className="shortcut-reset" onClick={() => setDraft([...defaultShortcuts])}>기본 배치</button><button type="button" className="ghost-button" onClick={close}>취소</button><button type="button" className="primary-button" disabled={!draft?.length} onClick={save}>저장</button></footer>
    </dialog>
  </>;
}
