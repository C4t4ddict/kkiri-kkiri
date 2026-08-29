import { Navigate, Route, Routes } from 'react-router-dom';
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
import { useAuth } from './AuthContext';
import { AppShell } from './AppShell';

export function AppRoutes() {
  const { user } = useAuth();

  if (!user) {
    return <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>;
  }

  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="info" element={<InfoPage />} />
      <Route path="info/:id" element={<InfoDetailPage />} />
      <Route path="curricula" element={<CurriculaPage />} />
      <Route path="curricula/:id" element={<CurriculumDetailPage />} />
      <Route path="matching" element={<MatchingPage />} />
      <Route path="matching/new" element={<RecruitmentEditorPage />} />
      <Route path="matching/mine" element={<MyRecruitmentsPage />} />
      <Route path="matching/:id" element={<MatchingDetailPage />} />
      <Route path="matching/:id/edit" element={<RecruitmentEditorPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="activity/:teamId/manage" element={<ActivityManagePage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="mypage" element={<MyPage />} />
      <Route path="mypage/applications" element={<ApplicationsPage />} />
      <Route path="mypage/applications/:id" element={<ApplicationDetailPage />} />
      <Route path="mypage/templates" element={<TemplatesPage />} />
      <Route path="mypage/favorites" element={<FavoritesPage />} />
      <Route path="mypage/settings" element={<AccountSettingsPage />} />
      <Route path="mypage/archive" element={<ActivityArchivePage />} />
      <Route path="mypage/archive/:id" element={<PortfolioPage />} />
      <Route path="mypage/awards" element={<AwardsPage />} />
      <Route path="mypage/feedback" element={<FeedbackPage />} />
      <Route path="mypage/evaluations" element={<EvaluationsPage />} />
      <Route path="studio/curricula" element={<CurriculumStudioPage />} />
      <Route path="admin" element={<AdminOperationsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
