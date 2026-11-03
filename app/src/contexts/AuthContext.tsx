/**
 * Authentication context (Provider pattern).
 *
 * Owns the session: secure token persistence, restoring the session on launch,
 * login/register/logout and keeping the cached user in sync with the server.
 * The server is the authority for roles and entitlements; the cached user is
 * only used to render UI while offline.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth';
import { ApiError, setUnauthorizedHandler } from '../api/client';
import { authStorage } from '../storage/authStorage';
import { LoginRequest, RegisterRequest, TokenResponse, User } from '../types/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  acceptSession: (response: TokenResponse) => Promise<void>;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  /** True right after this device created the account (shows onboarding). */
  isNewAccount: boolean;
  finishOnboarding: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const signedOut: AuthState = { user: null, token: null, isLoading: false, isAuthenticated: false };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...signedOut, isLoading: true });
  const [isNewAccount, setNewAccount] = useState(false);
  const finishOnboarding = useCallback(() => setNewAccount(false), []);

  const clearLocalSession = useCallback(async () => {
    await authStorage.deleteToken().catch(() => {});
    setState(signedOut);
  }, []);

  // Restore a saved session on launch.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await Promise.race([
          authStorage.getToken(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (!token) return;
        try {
          const user = await authApi.me();
          await authStorage.saveUser(user);
          if (mounted) setState({ user, token, isLoading: false, isAuthenticated: true });
        } catch (error) {
          // Offline: keep the cached session so downloads stay playable.
          if (error instanceof ApiError && error.isNetworkError) {
            const cached = await authStorage.getUser();
            if (cached && mounted) setState({ user: cached, token, isLoading: false, isAuthenticated: true });
            return;
          }
          await authStorage.deleteToken().catch(() => {});
        }
      } finally {
        if (mounted) setState((s) => ({ ...s, isLoading: false }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // A 401 on any authenticated request means the session was revoked or expired.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearLocalSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearLocalSession]);

  const acceptSession = useCallback(async (response: TokenResponse) => {
    await authStorage.saveToken(response.access_token);
    await authStorage.saveUser(response.user);
    setState({ user: response.user, token: response.access_token, isLoading: false, isAuthenticated: true });
  }, []);

  const login = useCallback(
    async (data: LoginRequest) => {
      await acceptSession(await authApi.login(data));
    },
    [acceptSession],
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      await authApi.register(data);
      setNewAccount(true);
      await acceptSession(
        await authApi.login({
          username_or_email: data.email,
          password: data.password,
        }),
      );
    },
    [acceptSession],
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    await clearLocalSession();
  }, [clearLocalSession]);

  const refreshUser = useCallback(async () => {
    try {
      const user = await authApi.me();
      await authStorage.saveUser(user);
      setState((s) => ({ ...s, user }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) await clearLocalSession();
    }
  }, [clearLocalSession]);

  const setUser = useCallback((user: User) => {
    authStorage.saveUser(user).catch(() => {});
    setState((s) => ({ ...s, user }));
  }, []);

  const value = useMemo(
    () => ({ ...state, acceptSession, login, register, logout, refreshUser, setUser, isNewAccount, finishOnboarding }),
    [state, acceptSession, login, register, logout, refreshUser, setUser, isNewAccount, finishOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
