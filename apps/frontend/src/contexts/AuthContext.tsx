import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { authApi, type AuthUser } from "../api/auth";

// =============================================================================
// Types
// =============================================================================

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (pat: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (token: string, user: AuthUser) => void;
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

const TOKEN_KEY = "ryme_auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    // Initialize from sessionStorage (more secure than localStorage)
    return sessionStorage.getItem(TOKEN_KEY);
  });
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Verify the stored token on mount.
   * If valid, fetch the user profile. If invalid, clear the token.
   */
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    authApi
      .getMe()
      .then((userData) => {
        if (!cancelled) {
          setUser(userData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        // Token is invalid or expired — clear it
        if (!cancelled) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Set auth state after successful login.
   */
  const setAuth = useCallback((newToken: string, newUser: AuthUser) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  /**
   * Initiate login with a user-provided GitHub PAT.
   * Development mode: validates token against GitHub API.
   */
  const login = useCallback(async (pat: string) => {
    const result = await authApi.devLogin(pat);
    setAuth(result.token, result.user);
    window.location.href = "/";
  }, [setAuth]);

  /**
   * Log out the current user.
   * Clears local state and token.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    logout,
    setAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
