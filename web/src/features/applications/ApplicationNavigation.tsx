import { NavLink } from 'react-router-dom';

export function ApplicationNavigation() {
  return <nav className="account-section-tabs" aria-label="나의 지원 메뉴">
    <NavLink to="/matching/applications" end>지원 현황</NavLink>
    <NavLink to="/matching/applications/templates">지원서 관리</NavLink>
  </nav>;
}
