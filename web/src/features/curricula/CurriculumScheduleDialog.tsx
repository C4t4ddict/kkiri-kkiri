import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../shared/api/client';
import type { Curriculum, CurriculumPlan } from '../../shared/types/domain';

const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
const todayKst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nextMonday = (day: string) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7)); return date.toISOString().slice(0, 10); };
const readableDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });
const presets = [{ name: '주 3일', days: [1, 3, 5] }, { name: '평일', days: [1, 2, 3, 4, 5] }, { name: '주말', days: [6, 7] }, { name: '매일', days: [1, 2, 3, 4, 5, 6, 7] }];

export function CurriculumScheduleDialog({ curriculum, onClose }: { curriculum: Curriculum; onClose: () => void }) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const today = todayKst();
  const [start, setStart] = useState(today);
  const [days, setDays] = useState([1, 3, 5]);
  const [minutes, setMinutes] = useState(90);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState('');
  const [mode, setMode] = useState('PERSONAL');
  const [teamName, setTeamName] = useState(`${curriculum.title} 스터디`);
  const [members, setMembers] = useState(4);
  const [recruit, setRecruit] = useState(false);
  const [preview, setPreview] = useState<{ key: string; plan: CurriculumPlan } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const requestKey = JSON.stringify({ start_date: start, available_weekdays: days, daily_minutes: minutes, excluded_dates: excluded, expected_version_id: curriculum.version_id });
  const plan = preview?.key === requestKey ? preview.plan : null;

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPreviewError(''); setSaveError(''); setShowAll(false);
    if (!start || start < today || start > '2099-12-31') { setPreview(null); setPreviewError('오늘 이후의 올바른 시작일을 선택해주세요.'); return; }
    const timer = window.setTimeout(async () => {
      try {
        const response = await api<{ plan: CurriculumPlan }>(`/api/curricula/${curriculum.curriculum_id}/preview`, { method: 'POST', body: requestKey, signal: controller.signal });
        if (active) setPreview({ key: requestKey, plan: response.plan });
      } catch (error) { if (active) { setPreview(null); setPreviewError(error instanceof Error ? error.message : '미리보기를 불러오지 못했습니다.'); } }
    }, 300);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [requestKey, curriculum.curriculum_id, retry, start, today]);

  const enroll = async () => {
    if (!plan || savingRef.current) return;
    if (mode === 'TEAM' && !teamName.trim()) { setSaveError('팀 이름을 입력해주세요.'); return; }
    savingRef.current = true; setSaving(true); setSaveError('');
    try {
      await api(`/api/curricula/${curriculum.curriculum_id}/enroll`, { method: 'POST', body: JSON.stringify({ ...JSON.parse(requestKey),
        participation_mode: mode, team_name: mode === 'TEAM' ? teamName : undefined, required_members: members,
        open_recruitment: mode === 'TEAM' && recruit, expected_version_id: curriculum.version_id,
      }) });
      onClose(); navigate(`/calendar?date=${plan.start_date}`);
    } catch (error) { setSaveError(error instanceof Error ? error.message : '일정을 저장하지 못했습니다.'); savingRef.current = false; setSaving(false); }
  };
  const addExcluded = () => {
    if (excludeInput && excludeInput >= start && !excluded.includes(excludeInput) && excluded.length < 120) {
      setExcluded([...excluded, excludeInput].sort()); setExcludeInput('');
    }
  };
  const sessions = plan?.sessions || [];
  const dailyGoals = plan?.goals.filter(goal => goal.scope_type === '일일') || [];
  return <dialog ref={dialog} className="cp-schedule" aria-labelledby="cp-schedule-title" onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }}>
    <header><div><h2 id="cp-schedule-title">내 일정에 맞추기</h2><p>{curriculum.title}</p></div><button aria-label="일정 설정 닫기" disabled={saving} onClick={onClose}><X size={20} /></button></header>
    <div className="cp-schedule-layout"><fieldset disabled={saving} className="cp-schedule-fields"><legend className="sr-only">학습 일정 설정</legend>
      <label>시작일<input type="date" min={today} max="2099-12-31" value={start} onChange={event => setStart(event.target.value)} /></label>
      <div className="cp-quick"><button onClick={() => setStart(today)}>오늘부터</button><button onClick={() => setStart(nextMonday(today))}>다음 주 월요일부터</button></div>
      <div className="cp-field-title" id="cp-days-label">학습 요일</div>
      <div className="cp-presets">{presets.map(preset => <button key={preset.name} aria-pressed={preset.days.join() === days.join()} onClick={() => setDays(preset.days)}>{preset.name}</button>)}</div>
      <div className="cp-days" role="group" aria-labelledby="cp-days-label">{weekdays.map((label, index) => <button key={label} aria-label={`${label}요일`} aria-pressed={days.includes(index + 1)} onClick={() => setDays(current => current.includes(index + 1) ? current.length > 1 ? current.filter(day => day !== index + 1) : current : [...current, index + 1].sort())}>{label}</button>)}</div>
      <label>하루 학습량<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[30, 60, 90, 120, 180, 240].map(value => <option key={value} value={value}>{value}분</option>)}</select></label>
      <p className="cp-hint">선택한 요일에 순서대로 배치합니다. 과제가 몰리면 다음 학습일로 넘깁니다.</p>
      <details className="cp-exclusions"><summary>쉬는 날짜 제외 {excluded.length > 0 && `(${excluded.length})`}</summary><div className="cp-exclude-input"><input aria-label="제외할 날짜" type="date" min={start} max="2099-12-31" value={excludeInput} onChange={event => setExcludeInput(event.target.value)} /><button disabled={!excludeInput || excludeInput < start || excluded.length >= 120 || excluded.includes(excludeInput)} onClick={addExcluded}>제외</button></div><div className="cp-excluded">{excluded.map(day => <button key={day} aria-label={`${day} 제외 취소`} onClick={() => setExcluded(excluded.filter(value => value !== day))}>{day.slice(5)} <X size={12} /></button>)}</div></details>
      <label>참여 방식<select value={mode} onChange={event => setMode(event.target.value)}><option value="PERSONAL">개인 활동으로 시작</option><option value="TEAM">새 팀을 만들어 함께 시작</option></select></label>
      {mode === 'TEAM' && <div className="cp-team-settings"><label>팀 이름<input maxLength={80} value={teamName} onChange={event => setTeamName(event.target.value)} /></label><label>목표 인원<select value={members} onChange={event => setMembers(Number(event.target.value))}>{[2, 3, 4, 5, 6, 8].map(value => <option value={value} key={value}>{value}명</option>)}</select></label><label className="cp-checkbox"><input type="checkbox" checked={recruit} onChange={event => setRecruit(event.target.checked)} /> 매칭 탭에 모집글 공개</label></div>}
    </fieldset><section className="cp-schedule-preview" aria-label="배치 미리보기" aria-busy={!plan && !previewError}><h3>이렇게 시작해요</h3>
      {previewError ? <p role="alert" className="cp-error">{previewError} <button onClick={() => setRetry(value => value + 1)}>다시 시도</button></p> : !plan ? <p role="status" className="cp-hint">일정을 배치하고 있어요…</p> : <>
        <p className="cp-plan-period">{readableDate(plan.start_date)} — {readableDate(plan.end_date)}</p>
        <p className="cp-plan-summary">학습일 {sessions.length}일 · 실행 과제 {dailyGoals.length}개<br />전체 목표 {plan.goals.length}개가 활동과 캘린더에 추가됩니다.</p>
        {plan.moved_goal_count > 0 && <p className="cp-adjustment">내 요일과 학습량에 맞춰 과제 {plan.moved_goal_count}개의 날짜를 조정했어요.</p>}
        {plan.warnings.map(warning => <p className="cp-hint" key={warning}>{warning}</p>)}
        <ol className="cp-session-list">{(showAll ? sessions : sessions.slice(0, 5)).map(session => <li key={session.date}><header><time>{readableDate(session.date)}</time><small>{session.minutes}분</small></header>{dailyGoals.filter(goal => goal.scope_start_date === session.date).map(goal => <p key={goal.stable_key}>{goal.title}</p>)}</li>)}</ol>
        {sessions.length > 5 && <button className="cp-show-all" onClick={() => setShowAll(!showAll)}>{showAll ? '접기' : `학습일 ${sessions.length}일 전체 보기`}</button>}
        {!sessions.length && <p className="cp-hint">일일 과제가 없는 과정입니다. 등록된 주간·월간 목표만 추가됩니다.</p>}
        <p className="cp-hint">시각이 없는 학습 목표로 추가됩니다. 기존 약속과의 시간 충돌을 자동으로 검사하지는 않습니다.</p>
      </>}
    </section></div>
    <footer>{saveError && <p role="alert" className="cp-error">{saveError}</p>}<span>확정 후 캘린더로 이동합니다.</span><button className="cp-primary" disabled={saving || !plan || !!previewError} onClick={enroll}>{saving ? '저장 중…' : '활동·캘린더에 추가'}</button></footer>
  </dialog>;
}
