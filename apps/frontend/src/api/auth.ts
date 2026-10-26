import { api } from "./client";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  githubId: number;
  githubLogin: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LoginInitResponse {
  authorizationUrl: string;
  state: string;
}

export const authApi = {
  /**
   * Get the GitHub authorization URL to redirect the user to.
   */
  async initiateLogin(): Promise<LoginInitResponse> {
    const response = await api.get<{ data: LoginInitResponse }>(
      "/auth/github"
    );
    return response.data.data;
  },

  /**
   * Exchange the OAuth code + state for a JWT token and user profile.
   * Called from the callback page after GitHub redirects back.
   */
  async handleCallback(code: string, state: string): Promise<AuthResponse> {
    const response = await api.post<{ data: AuthResponse }>(
      "/auth/github/callback",
      { code, state }
    );
    return response.data.data;
  },

  /**
   * Development-only login using a user-provided GitHub PAT.
   * The token is validated against GitHub API, encrypted, and stored.
   */
  async devLogin(token: string): Promise<AuthResponse> {
    const response = await api.post<{ data: AuthResponse }>(
      "/dev/login",
      { token }
    );
    return response.data.data;
  },

  /**
   * Check if dev login is enabled.
   */
  async devStatus(): Promise<{ enabled: boolean }> {
    const response = await api.get<{ data: { enabled: boolean } }>(
      "/dev/status"
    );
    return response.data.data;
  },

  /**
   * Get the currently authenticated user's profile.
   */
  async getMe(): Promise<AuthUser> {
    const response = await api.get<{ data: AuthUser }>("/auth/me");
    return response.data.data;
  },

  /**
   * Log out the current user.
   */
  async logout(): Promise<void> {
    await api.post("/auth/logout");
  },
};
