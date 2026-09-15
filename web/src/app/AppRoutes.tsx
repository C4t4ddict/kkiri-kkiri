import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ActivityPage } from '../pages/ActivityPage';
import { ActivityManagePage } from '../pages/ActivityManagePage';
import { EvaluationsPage } from '../pages/EvaluationsPage';
import { ApplicationDetailPage } from '../pages/ApplicationDetailPage';
import { ApplicationsPage } from '../pages/ApplicationsPage';
import { HomePage } from '../pages/HomePage';
import { InfoPage } from '../pages/InfoPage';
import { InfoDetailPage } from '../pages/InfoDetailPage';
import { LoginPage } from '../pages/LoginPage';
import { MatchingPage } from '../pages/MatchingPage';
import { MyPage } from '../pages/MyPage';
import { TemplatesPage } from '../pages/TemplatesPage';
import { CurriculaPage } from '../pages/CurriculaPage';
import { CurriculumDetailPage } from '../pages/CurriculumDetailPage';
import { CurriculumStudioPage } from '../pages/CurriculumStudioPage';
import { ForgotPasswordPage, RegisterPage } from '../pages/AuthSupportPages';
import { NotificationsPage } from '../pages/NotificationsPage';
import { MatchingDetailPage, MyRecruitmentsPage, RecruitmentEditorPage } from '../pages/MatchingFeaturePages';
import { AccountSettingsPage, ActivityArchivePage, AwardsPage, FavoritesPage, FeedbackPage, PortfolioPage } from '../pages/AccountFeaturePages';
import { AdminOperationsPage } from '../pages/AdminOperationsPage';
import { MessagesPage } from '../pages/MessagesPage';
import { SearchResultsPage } from '../pages/SearchResultsPage';
import { MiniPortfolioEntryPage, PortfolioManagementPage } from '../pages/PortfolioManagementPage';
import { PageState } from '../shared/ui/PageState';
import { useAuth } from './AuthContext';
import { AppShell } from './AppShell';
import '../pages/journey.css';

const ActivityDocumentsPage = lazy(() => import('../pages/ActivityDocumentsPage')
  .then((module) => ({ default: module.ActivityDocumentsPage })));
const CalendarPage = lazy(() => import('../pages/CalendarPage').then(module => ({ default: module.CalendarPage })));
const JourneyWorkspacePage = lazy(() => import('../pages/JourneyPages').then(module => ({ default: module.JourneyWorkspacePage })));
const JourneyPortfolioPage = lazy(() => import('../pages/JourneyPages').then(module => ({ default: module.JourneyPortfolioPage })));
const NewTeamPage = lazy(() => import('../pages/JourneyPages').then(module => ({ default: module.NewTeamPage })));
const JoinTeamPage = lazy(() => import('../pages/JourneyPages').then(module => ({ default: module.JoinTeamPage })));
const PublicPortfolioPage = lazy(() => import('../pages/JourneyPages').then(module => ({ default: module.PublicPortfolioPage })));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initializing, authError, refreshUser, logout } = useAuth();
  const location = useLocation();
  if (initializing) return <PageState loading />;
  if (!user && authError) return <main className="auth-session-state"><div className="state-card error"><strong>회원정보를 불러오지 못했습니다.</strong><span>{authError}</span><div><button onClick={() => { void refreshUser(); }}>다시 연결</button><button onClick={logout}>다시 로그인</button></div></div></main>;
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
}

function LegacyCurriculumDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={`/curriculum/${id}`} replace />;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { adminAccess } = useAuth();
  if (adminAccess === 'checking') return <PageState loading />;
  return adminAccess === 'allowed' ? children : <PageState error="김끼리 관리자 계정만 접근할 수 있습니다." />;
}

function LegacyAccountRedirect({ to }: { to: string }) {
  const { id } = useParams();
  const location = useLocation();
  return <Navigate to={`${to}${id ? `/${id}` : ''}${location.search}${location.hash}`} replace />;
}

export function AppRoutes() {
  const { initializing } = useAuth();
  if (initializing) return <main className="auth-session-state"><PageState loading /></main>;
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/join/:token" element={<Suspense fallback={<PageState loading />}><JoinTeamPage /></Suspense>} />
    <Route path="/portfolio/shared/:token" element={<Suspense fallback={<PageState loading />}><PublicPortfolioPage /></Suspense>} />
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="search" element={<SearchResultsPage />} />
      <Route path="info" element={<InfoPage />} />
      <Route path="info/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
      <Route path="info/:id" element={<InfoDetailPage />} />
      <Route path="curriculum" element={<CurriculaPage />} />
      <Route path="curriculum/:id" element={<CurriculumDetailPage />} />
      <Route path="curricula" element={<Navigate to="/curriculum" replace />} />
      <Route path="curricula/:id" element={<LegacyCurriculumDetailRedirect />} />
      <Route path="matching" element={<MatchingPage />} />
      <Route path="matching/new" element={<RequireAuth><RecruitmentEditorPage /></RequireAuth>} />
      <Route path="matching/mine" element={<RequireAuth><MyRecruitmentsPage /></RequireAuth>} />
      <Route path="matching/applications" element={<RequireAuth><ApplicationsPage /></RequireAuth>} />
      <Route path="matching/applications/templates" element={<RequireAuth><TemplatesPage /></RequireAuth>} />
      <Route path="matching/applications/:id" element={<RequireAuth><ApplicationDetailPage /></RequireAuth>} />
      <Route path="matching/:id" element={<MatchingDetailPage />} />
      <Route path="matching/:id/edit" element={<RequireAuth><RecruitmentEditorPage /></RequireAuth>} />
      <Route path="activity" element={<RequireAuth><ActivityPage /></RequireAuth>} />
      <Route path="activity/portfolios" element={<RequireAuth><PortfolioManagementPage /></RequireAuth>} />
      <Route path="activity/portfolios/:id" element={<RequireAuth><PortfolioPage /></RequireAuth>} />
      <Route path="activity/archive" element={<RequireAuth><ActivityArchivePage /></RequireAuth>} />
      <Route path="activity/new" element={<RequireAuth><Suspense fallback={<PageState loading />}><NewTeamPage /></Suspense></RequireAuth>} />
      <Route path="activity/:teamId/work" element={<RequireAuth><Suspense fallback={<PageState loading />}><JourneyWorkspacePage /></Suspense></RequireAuth>} />
      <Route path="activity/:teamId/portfolio" element={<RequireAuth><MiniPortfolioEntryPage /></RequireAuth>} />
      <Route path="activity/:teamId/contributions" element={<RequireAuth><Suspense fallback={<PageState loading />}><JourneyPortfolioPage /></Suspense></RequireAuth>} />
      <Route path="calendar" element={<RequireAuth><Suspense fallback={<PageState loading />}><CalendarPage /></Suspense></RequireAuth>} />
      <Route path="activity/:teamId/manage" element={<RequireAuth><ActivityManagePage /></RequireAuth>} />
      <Route path="activity/:teamId/documents" element={<RequireAuth><Suspense fallback={<PageState loading />}><ActivityDocumentsPage /></Suspense></RequireAuth>} />
      <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route path="messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
      <Route path="friends" element={<RequireAuth><MessagesPage friendsOnly /></RequireAuth>} />
      <Route path="mypage" element={<RequireAuth><MyPage /></RequireAuth>} />
      <Route path="mypage/applications" element={<LegacyAccountRedirect to="/matching/applications" />} />
      <Route path="mypage/applications/:id" element={<LegacyAccountRedirect to="/matching/applications" />} />
      <Route path="mypage/templates" element={<LegacyAccountRedirect to="/matching/applications/templates" />} />
      <Route path="mypage/favorites" element={<LegacyAccountRedirect to="/info/favorites" />} />
      <Route path="mypage/settings" element={<RequireAuth><AccountSettingsPage /></RequireAuth>} />
      <Route path="mypage/archive" element={<LegacyAccountRedirect to="/activity/archive" />} />
      <Route path="mypage/archive/:id" element={<LegacyAccountRedirect to="/activity/portfolios" />} />
      <Route path="mypage/awards" element={<RequireAuth><AwardsPage /></RequireAuth>} />
      <Route path="mypage/feedback" element={<RequireAuth><FeedbackPage /></RequireAuth>} />
      <Route path="mypage/evaluations" element={<RequireAuth><EvaluationsPage /></RequireAuth>} />
      <Route path="studio/curriculum" element={<RequireAuth><RequireAdmin><CurriculumStudioPage /></RequireAdmin></RequireAuth>} />
      <Route path="studio/curricula" element={<Navigate to="/studio/curriculum" replace />} />
      <Route path="admin" element={<RequireAuth><RequireAdmin><AdminOperationsPage /></RequireAdmin></RequireAuth>} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
