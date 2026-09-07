import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Clock3, Plus, Search, Star, X } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import { addDays, dateOf, dayKey, daySignals, itemOrder, kindLabel, monthDays, onDay, shortDate, weekRanges, whenLabel, type CalendarData, type CalendarItem } from '../features/calendar/model';
import '../styles/calendar.css';

const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
const readableDate = (day: string) => dateOf(day).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const validDay = (value: string | null): value is string => !!value && /^20\d\d-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(dateOf(value).getTime()) && dayKey(dateOf(value)) === value;

function CalendarDialog({ item, day, teams, onClose, onSaved }: {
  item: CalendarItem | 'new'; day: string; teams: CalendarData['teams']; onClose: () => void; onSaved: (day: string, message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const editable = item === 'new' || item.kind === 'event';
  const original = item === 'new' ? null : item;
  const [title, setTitle] = useState(original?.title || '');
  const [notes, setNotes] = useState(original?.notes || '');
  const [start, setStart] = useState(original?.start_date || day);
  const [end, setEnd] = useState(original?.end_date || day);
  const [startTime, setStartTime] = useState(original?.start_time || '09:00');
  const [endTime, setEndTime] = useState(original?.end_time || '10:00');
  const [allDay, setAllDay] = useState(original?.all_day ?? true);
  const [important, setImportant] = useState(original?.important ?? false);
  const [completed, setCompleted] = useState(original?.completed ?? false);
  const [teamId, setTeamId] = useState(String(original?.team_id || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`/api/calendar/events${original ? `/${original.event_id}` : ''}`, {
        method: original ? 'PUT' : 'POST', body: JSON.stringify({ title, notes, start_date: start, end_date: end,
          all_day: allDay, start_time: startTime, end_time: endTime, important, completed,
          team_id: teamId ? Number(teamId) : null, version: original?.version }),
      });
      onSaved(start, '일정을 저장했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '일정을 저장하지 못했습니다.'); setBusy(false); }
  };
  const remove = async () => {
    if (!original || busy) return;
    setBusy(true); setError('');
    try { await api(`/api/calendar/events/${original.event_id}`, { method: 'DELETE' }); onSaved(day, '일정을 삭제했습니다.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '삭제하지 못했습니다.'); setBusy(false); }
  };
  return <dialog className="mc-dialog" ref={dialog} aria-labelledby="mc-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><span>{editable ? '나에게만 보이는 일정 · 한국시간(KST)' : original?.team_name}</span><h2 id="mc-dialog-title">{item === 'new' ? '일정 추가' : editable ? '일정 수정' : kindLabel(original!)}</h2></div><button type="button" aria-label="닫기" onClick={onClose} disabled={busy}><X /></button></header>
    {editable ? <form onSubmit={save}>
      <label>제목<input autoFocus required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="어떤 일정인가요?" /></label>
      <div className="mc-form-checks"><label><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> 종일</label><label><input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} /> 중요한 일정</label>{original && <label><input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} /> 완료</label>}</div>
      <div className="mc-form-dates"><label>시작일<input type="date" required min="2000-01-01" max="2099-12-31" value={start} onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} /></label><label>종료일<input type="date" required min={start} max="2099-12-31" value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      {!allDay && <div className="mc-form-dates"><label>시작 시간<input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} /></label><label>종료 시간<input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></label></div>}
      <label>연결할 활동<select value={teamId} onChange={e => setTeamId(e.target.value)}><option value="">개인 일정</option>{teams.map(team => <option key={team.team_id} value={team.team_id}>{team.team_name}</option>)}</select></label>
      <label>메모<textarea rows={3} maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="장소, 준비할 것, 기억할 내용을 남겨보세요." /></label>
      {error && <p role="alert" className="mc-error">{error}</p>}
      {confirmDelete && <div className="mc-delete-confirm"><span>이 일정을 삭제할까요?</span><button type="button" disabled={busy} onClick={remove}>삭제 확인</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>취소</button></div>}
      <footer>{original && <button type="button" className="mc-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>일정 삭제</button>}<button type="button" className="mc-button" onClick={onClose} disabled={busy}>취소</button><button className="mc-button primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button></footer>
    </form> : <div className="mc-detail"><h3>{original?.title}</h3><p>{shortDate(start)}{start !== end ? ` — ${shortDate(end)}` : ''} · {whenLabel(original!)}</p><p className={completed ? 'done' : ''}>{completed ? '완료' : original?.in_progress ? '진행 중' : '시작 전'}{original?.total_count ? ` · ${original.completed_count}/${original.total_count} 완료` : ''}</p>{notes && <p className="mc-notes">{notes}</p>}<p className="mc-detail-hint">활동에서 수정한 내용이 캘린더에 함께 반영됩니다.</p>{original?.href && <Link className="mc-button primary" to={original.kind === 'goal' ? original.href.replace(/date=[^&]+/, `date=${day >= start && day <= end ? day : start}`) : original.href} onClick={onClose}>활동에서 확인 <ArrowUpRight /></Link>}</div>}
  </dialog>;
}

export function CalendarPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = dayKey(new Date());
  const initialDay = validDay(params.get('date')) ? params.get('date')! : today;
  const [selected, setSelected] = useState(initialDay);
  const [month, setMonth] = useState(initialDay.slice(0, 7));
  const [view, setView] = useState<'month' | 'agenda'>(params.get('view') === 'agenda' ? 'agenda' : 'month');
  const [team, setTeam] = useState('all');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState<CalendarItem | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const days = useMemo(() => monthDays(month), [month]);
  const start = days[0], end = days[days.length - 1];
  const data = useAsync(() => api<CalendarData>(`/api/calendar?start=${start}&end=${end}`), [start, end, user?.id]);
  useEffect(() => { window.addEventListener('focus', data.reload); return () => window.removeEventListener('focus', data.reload); }, [data.reload]);
  const ready = data.data?.start === start && data.data?.end === end;
  const all = ready && !data.error ? data.data!.events : [];
  const items = all.filter(item => (showDone || !item.completed)
    && (team === 'all' || (team === 'personal' ? item.team_id === null : String(item.team_id) === team))
    && (kind === 'all' || (kind === 'important' ? item.important : kind === 'deadline' ? ['deadline', 'issue'].includes(item.kind) : item.kind === kind))
    && `${item.title} ${item.team_name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedItems = items.filter(item => onDay(item, selected)).sort(itemOrder);
  const signalsByDay = useMemo(() => new Map(days.map(day => [day, daySignals(day, all)])), [days, all]);
  const selectedSignals = signalsByDay.get(selected) || daySignals(selected, all);
  const upcoming = items.filter(item => item.important && !item.completed && item.end_date >= selected).sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, 4);
  const overlapDays = days.filter(day => day.startsWith(month) && signalsByDay.get(day)!.collisions.length > 0);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  useEffect(() => { setParams({ date: selected, view }, { replace: true }); }, [selected, view, setParams]);
  const selectDay = (day: string) => { setSelected(day); setNotice(''); if (!day.startsWith(month)) setMonth(day.slice(0, 7)); };
  const inspectDay = (day: string) => {
    selectDay(day);
    if (window.matchMedia('(max-width: 1000px)').matches) window.requestAnimationFrame(() =>
      document.getElementById('mc-day-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const moveMonth = (direction: number) => {
    const date = dateOf(`${month}-01`); date.setMonth(date.getMonth() + direction);
    if (date.getFullYear() < 2000 || date.getFullYear() > 2099) return;
    const next = dayKey(date); setMonth(next.slice(0, 7)); setSelected(next.startsWith(today.slice(0, 7)) ? today : next);
  };
  const dayKeys = (event: KeyboardEvent, day: string) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in offsets)) return;
    event.preventDefault(); const next = addDays(day, offsets[event.key]);
    if (!validDay(next)) return;
    selectDay(next); window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-calendar-day="${next}"]`)?.focus());
  };
  const eventButton = (item: CalendarItem, compact = false) => <button type="button" key={item.id} className={`mc-entry ${item.kind}${item.completed ? ' done' : ''}${compact ? ' compact' : ''}`} title={`${item.title} · ${item.team_name} · ${whenLabel(item)}`} onClick={() => setModal(item)}>
    <span className="mc-entry-marker" aria-hidden="true">{item.important ? <Star /> : item.completed ? <Check /> : null}</span><span><strong>{item.title}</strong>{!compact && <small>{kindLabel(item)} · {item.team_name}</small>}</span>{!compact && <time>{whenLabel(item)}</time>}
  </button>;
  return <div className="master-calendar">
    <header className="mc-heading"><div><h1>캘린더</h1><p>참여 활동의 목표와 마감, 나의 중요한 일정을 모아보세요.</p></div><button className="mc-button primary" onClick={() => setModal('new')}><Plus /> 일정 추가</button></header>
    <div className="mc-toolbar"><div className="mc-month-control"><button className="mc-icon-button" aria-label="이전 달" onClick={() => moveMonth(-1)} disabled={month === '2000-01'}><ChevronLeft /></button><label><span className="sr-only">표시할 월</span><input aria-label="표시할 월" type="month" min="2000-01" max="2099-12" value={month} onChange={e => { if (validDay(`${e.target.value}-01`)) { setMonth(e.target.value); setSelected(`${e.target.value}-01`); } }} /></label><button className="mc-icon-button" aria-label="다음 달" onClick={() => moveMonth(1)} disabled={month === '2099-12'}><ChevronRight /></button><button className="mc-button mc-today" onClick={() => selectDay(today)}>오늘</button></div><div className="mc-view-tabs" aria-label="캘린더 보기"><button aria-pressed={view === 'month'} onClick={() => setView('month')}>월간</button><button aria-pressed={view === 'agenda'} onClick={() => setView('agenda')}>목록</button></div></div>
    <div className="mc-filters"><div className="mc-kind-filters" aria-label="일정 종류">{[['all', '전체'], ['goal', '목표'], ['deadline', '마감'], ['event', '내 일정'], ['important', '중요']].map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div><div className="mc-filter-inputs"><label><span className="sr-only">활동 필터</span><select aria-label="활동 필터" value={team} onChange={e => setTeam(e.target.value)}><option value="all">모든 활동</option><option value="personal">개인 일정</option>{data.data?.teams.map(item => <option value={item.team_id} key={item.team_id}>{item.team_name}</option>)}</select></label><label className="mc-search"><Search /><input aria-label="일정 검색" placeholder="일정 검색" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="mc-show-done"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> 완료 포함</label></div></div>
    {notice && <p className="mc-save-notice" role="status">{notice}</p>}
    {data.error && <div className="mc-error" role="alert">{data.error}<button onClick={data.reload}>다시 불러오기</button></div>}
    <div className="mc-content" aria-busy={data.loading}>
      <section className="mc-sheet" aria-label="월간 일정">
        <div className="mc-sheet-meta"><span>{data.loading ? '일정을 불러오는 중…' : `${Number(month.slice(5))}월 · ${items.filter(item => item.start_date <= `${month}-31` && item.end_date >= `${month}-01`).length}개 일정`}</span>{ready && !data.error && <button disabled={!overlapDays.length} onClick={() => selectDay(overlapDays[0])}>{overlapDays.length ? <><Clock3 /> 시간 겹침 {overlapDays.length}일</> : '시간 겹침 없음'}</button>}</div>
        {view === 'month' ? <div className="mc-month-grid"><div className="mc-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>{weeks.map(week => {
          const ranges = weekRanges(week, items);
          const visibleRanges = ranges.filter(range => range.lane < 2);
          return <div className="mc-week" key={week[0]}><div className="mc-date-row">{week.map(day => <button type="button" key={day} data-calendar-day={day} tabIndex={selected === day ? 0 : -1} aria-label={`${readableDate(day)}, 일정 ${items.filter(item => onDay(item, day)).length}개`} aria-pressed={selected === day} aria-current={day === today ? 'date' : undefined} className={`${day === selected ? 'selected ' : ''}${day === today ? 'today ' : ''}${day.startsWith(month) ? '' : 'outside'}`} onClick={() => inspectDay(day)} onKeyDown={e => dayKeys(e, day)}><span>{Number(day.slice(-2))}</span>{signalsByDay.get(day)!.collisions.length > 0 && <i aria-label="시간 겹침" />}</button>)}</div>
            {visibleRanges.length > 0 && <div className="mc-range-tracks" style={{ gridTemplateRows: `repeat(${Math.min(2, Math.max(...visibleRanges.map(range => range.lane)) + 1)}, 22px)` }}>{visibleRanges.map(({ item, start: colStart, end: colEnd, lane }) => <button className={`mc-range ${item.kind}${item.completed ? ' done' : ''}`} title={`${item.title} · ${shortDate(item.start_date)}–${shortDate(item.end_date)}`} key={item.id} style={{ gridColumn: `${colStart + 1} / ${colEnd + 2}`, gridRow: lane + 1 }} onClick={() => setModal(item)}><span>{item.title}</span><small>{item.is_range ? '구간' : item.kind === 'goal' ? item.scope : ''}</small></button>)}</div>}
            <div className="mc-day-entries">{week.map(day => {
              const singles = items.filter(item => item.start_date === item.end_date && onDay(item, day)).sort(itemOrder);
              const more = Math.max(0, singles.length - 2) + ranges.filter(range => range.lane >= 2 && onDay(range.item, day)).length;
              return <div key={day} className={selected === day ? 'selected' : ''}>{singles.slice(0, 2).map(item => eventButton(item, true))}{more > 0 && <button className="mc-more" aria-label={`${readableDate(day)}, 일정 ${more}개 더 보기`} onClick={() => { selectDay(day); document.getElementById('mc-day-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}><span>+{more}개</span><span className="mc-more-label"> 더 보기</span></button>}</div>;
            })}</div>
          </div>;
        })}</div> : <div className="mc-agenda">{days.filter(day => day.startsWith(month) && items.some(item => onDay(item, day))).map(day => <section key={day}><button className={`mc-agenda-date${day === selected ? ' selected' : ''}`} onClick={() => selectDay(day)}><strong>{Number(day.slice(-2))}</strong><span>{weekdays[(dateOf(day).getDay() + 6) % 7]}</span></button><div>{items.filter(item => onDay(item, day)).sort(itemOrder).map(item => eventButton(item))}</div></section>)}{!data.loading && !items.some(item => days.some(day => day.startsWith(month) && onDay(item, day))) && <p className="mc-empty">이 조건에 해당하는 일정이 없습니다.</p>}</div>}
        <footer className="mc-legend"><span className="goal">목표</span><span className="deadline">활동·이슈 마감</span><span className="event">내 일정</span><small>시간 일정은 한국시간(KST) 기준</small></footer>
      </section>
      <aside className="mc-day-detail" id="mc-day-detail"><header><button className="mc-back-to-month" onClick={() => document.querySelector('.mc-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>달력으로 ↑</button><span>{selected === today ? '오늘의 일정' : '선택한 날'}</span><h2>{readableDate(selected)}</h2></header>
        {!!selectedSignals.collisions.length && <div className="mc-overlap-note"><strong><Clock3 /> 시간이 겹치는 일정이 있어요</strong>{selectedSignals.collisions.slice(0, 3).map(([a, b]) => <p key={`${a.id}:${b.id}`}><button onClick={() => setModal(a)}>{a.title}</button><span> ↔ </span><button onClick={() => setModal(b)}>{b.title}</button></p>)}{selectedSignals.collisions.length > 3 && <p>{selectedSignals.collisions.length >= 100 ? '외 여러 일정이 더 겹칩니다.' : `외 ${selectedSignals.collisions.length - 3}쌍`}</p>}<small>필터와 관계없이 전체 미완료 일정 기준</small></div>}
        {(selectedSignals.deadlines.length > 1 || selectedSignals.parallelTeams > 1) && <p className="mc-day-note">{selectedSignals.deadlines.length > 1 ? `마감 ${selectedSignals.deadlines.length}개가 같은 날에 있어요. ` : ''}{selectedSignals.parallelTeams > 1 ? `활동 ${selectedSignals.parallelTeams}개의 목표를 함께 진행하는 날이에요.` : ''}</p>}
        <div className="mc-detail-list">{selectedItems.map(item => <div key={item.id}>{eventButton(item)}{item.start_date !== item.end_date && <p className="mc-range-caption">{shortDate(item.start_date)} — {shortDate(item.end_date)}{item.total_count ? ` · ${item.completed_count}/${item.total_count} 완료` : ''}</p>}</div>)}{!selectedItems.length && <p className="mc-empty">{data.loading ? '일정을 확인하고 있어요.' : data.error ? '연결 상태를 확인해주세요.' : kind !== 'all' || team !== 'all' || query || (!showDone && all.some(item => onDay(item, selected))) ? '필터에 맞는 일정이 없어요.' : '등록된 일정이 없어요.\n여유 있는 하루를 계획해보세요.'}</p>}</div>
        <button className="mc-day-add" onClick={() => setModal('new')}><Plus /> 이 날짜에 일정 추가</button>
        <section className="mc-upcoming"><h3><Star /> 다가오는 중요한 일정</h3>{upcoming.length ? upcoming.map(item => <button key={item.id} onClick={() => { selectDay(item.end_date); setModal(item); }}><time>{shortDate(item.end_date)}</time><span>{item.title}</span><ChevronRight /></button>) : <p>현재 조회 기간에는 중요한 일정이 없어요.</p>}</section>
        <p className="mc-source-note">목표와 마감은 참여 활동에서 가져옵니다. 직접 추가한 일정은 나에게만 보입니다.</p>
      </aside>
    </div>
    {modal && <CalendarDialog item={modal} day={selected} teams={data.data?.teams || []} onClose={() => setModal(null)} onSaved={(day, message) => { setModal(null); setKind('all'); setTeam('all'); setQuery(''); selectDay(day); setNotice(message); void data.reload(); }} />}
  </div>;
}
