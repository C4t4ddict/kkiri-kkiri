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
import { useAuth } from './AuthContext';
import { AppShell } from './AppShell';

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
      <Route path="activity/:teamId/manage" element={<RequireAuth><ActivityManagePage /></RequireAuth>} />
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
