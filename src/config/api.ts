import { Platform } from 'react-native';

// Shared with login, activity and authTransport. Set the service origin here
// when deploying the native app; do not invent a separate roadmap endpoint.
export const API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';
