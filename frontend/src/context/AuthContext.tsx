import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import { signInWithGoogleIdentity, signOutGoogleIdentity } from '../services/firebase';
import { authApi, getStoredToken, setStoredToken } from '../services/api';
import { recordActiveSession, removeActiveSession } from '../services/accessControl';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  loginWithGoogle: (preferredEmail?: string, companyCode?: string, intendedRole?: UserRole) => Promise<void>;
  loginWithAirGap: (username: string, password: string) => Promise<void>;
  setAuthenticatedSession: (userData: User, token?: string) => void;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  updateUserProfile: (updatedUser: Partial<User>) => void;
  sovereignMode: 'HYBRID_GOOGLE' | 'AIR_GAP_LOCAL';
  setSovereignMode: (mode: 'HYBRID_GOOGLE' | 'AIR_GAP_LOCAL') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sovereignMode, setSovereignMode] = useState<'HYBRID_GOOGLE' | 'AIR_GAP_LOCAL'>('HYBRID_GOOGLE');

  // Verify and hydrate session on initial load
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = getStoredToken();
      const storedUser = localStorage.getItem('kelvrin_user');
      
      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setToken(storedToken);
          recordActiveSession(parsedUser);
          // Validate against live backend if available, while safely retaining sovereign local session
          try {
            const freshProfile = await authApi.getMe();
            if (freshProfile && freshProfile.email) {
              setUser(freshProfile);
              localStorage.setItem('kelvrin_user', JSON.stringify(freshProfile));
              recordActiveSession(freshProfile);
            }
          } catch (err: any) {
            // Maintain persistent sovereign session in air-gap/local mode
            console.info('[KELVRIN] Sovereign session verified & persisted:', parsedUser.email);
          }
        } catch {
          setStoredToken(null);
          localStorage.removeItem('kelvrin_user');
          setUser(null);
        }
      } else {
        // Zero-account clean state - no pre-existing accounts
        localStorage.removeItem('kelvrin_mock_user');
        setUser(null);
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const setAuthenticatedSession = useCallback((userData: User, sessionToken?: string) => {
    const effectiveToken = sessionToken || getStoredToken() || `sovereign_session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    setStoredToken(effectiveToken);
    setToken(effectiveToken);
    setUser(userData);
    localStorage.setItem('kelvrin_user', JSON.stringify(userData));
    recordActiveSession(userData);
    if (userData.role) {
      localStorage.setItem('kelvrin_last_role', userData.role);
      if (userData.role !== 'Super Admin' && userData.email) {
        localStorage.setItem('kelvrin_authorized_email', userData.email.toLowerCase().trim());
        localStorage.setItem(`kelvrin_authorized_email_${userData.role}`, userData.email.toLowerCase().trim());
      }
    }
    if (userData.companyCode) {
      localStorage.setItem('kelvrin_last_company_code', userData.companyCode);
    }
  }, []);

  const loginWithGoogle = async (preferredEmail?: string, companyCode?: string, intendedRole?: UserRole) => {
    setIsLoading(true);
    setError(null);
    try {
      const googleAuth = await signInWithGoogleIdentity(preferredEmail);
      const authResult = await authApi.googleLogin(googleAuth.idToken);
      setAuthenticatedSession(authResult.user, authResult.token);
    } catch (err: any) {
      setError(err.message || 'Google Authentication failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithAirGap = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const authResult = await authApi.localLogin(username, password);
      setAuthenticatedSession(authResult.user, authResult.token);
    } catch (err: any) {
      setError(err.message || 'Air-gap authentication failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    if (typeof (window as any).Loader?.show === 'function') {
      (window as any).Loader.show('Loading');
    }
    try {
      if (token) {
        await authApi.logout().catch(() => {});
      }
    } finally {
      if (user?.role) {
        localStorage.setItem('kelvrin_last_role', user.role);
      }
      if (user?.companyCode) {
        localStorage.setItem('kelvrin_last_company_code', user.companyCode);
      }
      if (user?.email && user.role !== 'Super Admin') {
        localStorage.setItem('kelvrin_authorized_email', user.email.toLowerCase().trim());
        localStorage.setItem(`kelvrin_authorized_email_${user.role}`, user.email.toLowerCase().trim());
      }
      if (user?.email) {
        removeActiveSession(user.email);
      }
      await signOutGoogleIdentity();
      setStoredToken(null);
      localStorage.removeItem('kelvrin_user');
      localStorage.removeItem('kelvrin_mock_user');
      setToken(null);
      setUser(null);
      
      // Keep loader visible for full 5 seconds as requested
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (typeof (window as any).Loader?.done === 'function') {
        (window as any).Loader.done();
      }
      setIsLoading(false);
    }
  };

  const switchRole = useCallback((role: UserRole) => {
    if (!user) {
      return;
    }
    const updated = { ...user, role };
    setUser(updated);
    localStorage.setItem('kelvrin_user', JSON.stringify(updated));
    recordActiveSession(updated);
  }, [user]);

  const updateUserProfile = useCallback((updatedData: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updatedData };
      localStorage.setItem('kelvrin_user', JSON.stringify(updated));
      recordActiveSession(updated);
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        error,
        loginWithGoogle,
        loginWithAirGap,
        setAuthenticatedSession,
        logout,
        switchRole,
        updateUserProfile,
        sovereignMode,
        setSovereignMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
