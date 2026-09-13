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
  const { user } = useAuth();
  const location = useLocation();
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

function LegacyCurriculumDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={`/curriculum/${id}`} replace />;
}

export function AppRoutes() {
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
      <Route path="info/:id" element={<InfoDetailPage />} />
      <Route path="curriculum" element={<CurriculaPage />} />
      <Route path="curriculum/:id" element={<CurriculumDetailPage />} />
      <Route path="curricula" element={<Navigate to="/curriculum" replace />} />
      <Route path="curricula/:id" element={<LegacyCurriculumDetailRedirect />} />
      <Route path="matching" element={<MatchingPage />} />
      <Route path="matching/new" element={<RequireAuth><RecruitmentEditorPage /></RequireAuth>} />
      <Route path="matching/mine" element={<RequireAuth><MyRecruitmentsPage /></RequireAuth>} />
      <Route path="matching/:id" element={<MatchingDetailPage />} />
      <Route path="matching/:id/edit" element={<RequireAuth><RecruitmentEditorPage /></RequireAuth>} />
      <Route path="activity" element={<RequireAuth><ActivityPage /></RequireAuth>} />
      <Route path="activity/new" element={<RequireAuth><Suspense fallback={<PageState loading />}><NewTeamPage /></Suspense></RequireAuth>} />
      <Route path="activity/:teamId/work" element={<RequireAuth><Suspense fallback={<PageState loading />}><JourneyWorkspacePage /></Suspense></RequireAuth>} />
      <Route path="activity/:teamId/portfolio" element={<RequireAuth><Suspense fallback={<PageState loading />}><JourneyPortfolioPage /></Suspense></RequireAuth>} />
      <Route path="calendar" element={<RequireAuth><Suspense fallback={<PageState loading />}><CalendarPage /></Suspense></RequireAuth>} />
      <Route path="activity/:teamId/manage" element={<RequireAuth><ActivityManagePage /></RequireAuth>} />
      <Route path="activity/:teamId/documents" element={<RequireAuth><Suspense fallback={<PageState loading />}><ActivityDocumentsPage /></Suspense></RequireAuth>} />
      <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route path="messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
      <Route path="mypage" element={<RequireAuth><MyPage /></RequireAuth>} />
      <Route path="mypage/applications" element={<RequireAuth><ApplicationsPage /></RequireAuth>} />
      <Route path="mypage/applications/:id" element={<RequireAuth><ApplicationDetailPage /></RequireAuth>} />
      <Route path="mypage/templates" element={<RequireAuth><TemplatesPage /></RequireAuth>} />
      <Route path="mypage/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
      <Route path="mypage/settings" element={<RequireAuth><AccountSettingsPage /></RequireAuth>} />
      <Route path="mypage/archive" element={<RequireAuth><ActivityArchivePage /></RequireAuth>} />
      <Route path="mypage/archive/:id" element={<RequireAuth><PortfolioPage /></RequireAuth>} />
      <Route path="mypage/awards" element={<RequireAuth><AwardsPage /></RequireAuth>} />
      <Route path="mypage/feedback" element={<RequireAuth><FeedbackPage /></RequireAuth>} />
      <Route path="mypage/evaluations" element={<RequireAuth><EvaluationsPage /></RequireAuth>} />
      <Route path="studio/curriculum" element={<RequireAuth><CurriculumStudioPage /></RequireAuth>} />
      <Route path="studio/curricula" element={<Navigate to="/studio/curriculum" replace />} />
      <Route path="admin" element={<RequireAuth><AdminOperationsPage /></RequireAuth>} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
