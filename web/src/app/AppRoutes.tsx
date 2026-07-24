import { Navigate, Route, Routes } from 'react-router-dom';
import { ActivityPage } from '../pages/ActivityPage';
import { ApplicationDetailPage } from '../pages/ApplicationDetailPage';
import { ApplicationsPage } from '../pages/ApplicationsPage';
import { HomePage } from '../pages/HomePage';
import { InfoPage } from '../pages/InfoPage';
import { LoginPage } from '../pages/LoginPage';
import { MatchingPage } from '../pages/MatchingPage';
import { MyPage } from '../pages/MyPage';
import { TemplatesPage } from '../pages/TemplatesPage';
import { useAuth } from './AuthContext';
import { AppShell } from './AppShell';

export function AppRoutes() {
  const { user } = useAuth();

  if (!user) {
    return <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>;
  }

  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="info" element={<InfoPage />} />
      <Route path="matching" element={<MatchingPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="mypage" element={<MyPage />} />
      <Route path="mypage/applications" element={<ApplicationsPage />} />
      <Route path="mypage/applications/:id" element={<ApplicationDetailPage />} />
      <Route path="mypage/templates" element={<TemplatesPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
