import { AuthProvider } from './AuthContext';
import { AppRoutes } from './AppRoutes';

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}
