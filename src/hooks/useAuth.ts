import { useAuthContext, AuthProvider } from '../context/AuthContext';

export { AuthProvider };

export const useAuth = () => {
  return useAuthContext();
};
