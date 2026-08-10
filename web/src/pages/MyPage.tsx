import {
  Award,
  BriefcaseBusiness,
  ChevronRight,
  GripVertical,
  Heart,
  Megaphone,
  MessageCircleMore,
  Save,
  School,
  Send,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { DragEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';

const baseMenus = [
  ['my_evaluation', '나의 평가', '활동 평가와 성장 기록을 확인합니다.', '/activity', UserRoundCheck],
  ['team_evaluation', '팀원평가', '함께한 팀원의 평가를 관리합니다.', '/activity', UsersRound],
  ['settings', '설정', '계정과 개인정보를 관리합니다.', '/mypage/settings', Settings],
  ['favorites', '관심 활동', '저장한 활동을 다시 확인합니다.', '/mypage/favorites', Heart],
  ['my_recruitments', '나의 모집', '작성한 모집글을 관리합니다.', '/mypage/recruitments', Megaphone],
  ['my_applications', '나의 지원', '지원부터 합류까지 확인합니다.', '/mypage/applications', Send],
  ['awards', '수상내역', '수상 기록과 실수령 상금을 정리합니다.', '/mypage/awards', Award],
  ['friends', '친구', '친구 요청과 쪽지를 확인합니다.', '/mypage/friends', UsersRound],
  ['school_verification', '학교 인증', '학교 이메일로 본교 권한을 인증합니다.', '/mypage/school', School],
  ['developer_feedback', '개발자에게 한마디', '오류와 개선 의견을 전달합니다.', '/mypage/feedback', MessageCircleMore],
] as const;

type Menu = (typeof baseMenus)[number] | readonly ['admin', '운영 관리', string, string, typeof ShieldCheck];

export function MyPage() {
  const { user } = useAuth();
  const [order, setOrder] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const menus = useMemo<Menu[]>(() => user?.is_admin
    ? [...baseMenus, ['admin', '운영 관리', '활동 데이터와 사용자 의견을 관리합니다.', '/mypage/admin', ShieldCheck]]
    : [...baseMenus], [user?.is_admin]);

  useEffect(() => {
    api<{ order: string[] }>('/api/menu-preferences')
      .then((result) => setOrder(result.order))
      .catch(() => setOrder([]));
  }, []);

  const orderedMenus = useMemo(() => [...menus].sort((first, second) => {
    const firstIndex = order.indexOf(first[0]);
    const secondIndex = order.indexOf(second[0]);
    if (firstIndex < 0 && secondIndex < 0) return 0;
    if (firstIndex < 0) return 1;
    if (secondIndex < 0) return -1;
    return firstIndex - secondIndex;
  }), [menus, order]);

  const move = (event: DragEvent, targetKey: string) => {
    event.preventDefault();
    if (!dragging || dragging === targetKey) return;
    const keys: string[] = orderedMenus.map((item) => item[0]);
    const from = keys.indexOf(dragging);
    const to = keys.indexOf(targetKey);
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setOrder(keys);
  };

  const save = async () => {
    try {
      const nextOrder = orderedMenus.map((item) => item[0]);
      await api('/api/menu-preferences', { method: 'PUT', body: JSON.stringify({ order: nextOrder }) });
      setOrder(nextOrder);
      setEditing(false);
      setMessage('메뉴 순서를 저장했습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '메뉴 순서를 저장하지 못했습니다.');
    }
  };

  if (!user) return null;
  const schoolVerified = Boolean(user.school_access_enabled || (user.school_email_verified && user.school_domain));

  return <>
    <section className="profile-card">
      <div className="profile-avatar">{user.name.slice(0, 1)}</div>
      <div className="profile-copy">
        <span className="eyebrow">MY PROFILE</span>
        <h1>{user.name}</h1>
        <p>{user.email} · {user.department || '학과 미등록'}</p>
        <Link className={`school-chip ${schoolVerified ? 'verified' : ''}`} to="/mypage/school">
          <School size={14} /> {schoolVerified ? `${user.school_name || '학교'} 인증됨` : '학교 이메일 추가'}
        </Link>
      </div>
    </section>
    <div className="mypage-menu-head">
      <div><h2>내 메뉴</h2><p>자주 쓰는 기능을 원하는 순서로 정리할 수 있어요.</p></div>
      {editing
        ? <button className="primary-button compact" onClick={save}><Save size={15} /> 저장</button>
        : <button className="ghost-button" onClick={() => setEditing(true)}><GripVertical size={15} /> 편집</button>}
    </div>
    {message ? <p className="inline-message">{message}</p> : null}
    <div className={`menu-grid ${editing ? 'editing' : ''}`}>
      {orderedMenus.map(([key, title, description, path, Icon]) => {
        const content = <><div className="menu-icon"><Icon /></div><div><h3>{title}</h3><p>{description}</p></div>{editing ? <GripVertical /> : <ChevronRight />}</>;
        return editing
          ? <button
              className="menu-card draggable-menu"
              draggable
              key={key}
              onDragStart={() => setDragging(key)}
              onDragOver={(event) => move(event, key)}
              onDragEnd={() => setDragging(null)}
            >{content}</button>
          : <Link className="menu-card" to={path} key={key}>{content}</Link>;
      })}
    </div>
    <div className="mypage-shortcuts">
      <Link to="/activity"><BriefcaseBusiness size={17} /> 미니포트폴리오</Link>
    </div>
  </>;
}
