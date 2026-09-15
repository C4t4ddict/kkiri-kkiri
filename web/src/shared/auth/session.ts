export const getStoredToken = () => localStorage.getItem('kkiri_token');

export const setStoredSession = (token: string) => {
  localStorage.setItem('kkiri_token', token);
  localStorage.removeItem('kkiri_user');
};

export const clearStoredSession = () => {
  localStorage.removeItem('kkiri_token');
  localStorage.removeItem('kkiri_user');
};
