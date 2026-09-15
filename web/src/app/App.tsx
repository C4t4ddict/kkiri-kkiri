import { AuthProvider } from './AuthContext';
import { AppRoutes } from './AppRoutes';
import { StandaloneThemeToggle } from '../shared/ui/ThemeToggle';

export default function App() {
  return <AuthProvider><StandaloneThemeToggle /><AppRoutes /></AuthProvider>;
}
