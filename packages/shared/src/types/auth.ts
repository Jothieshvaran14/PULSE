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

export interface LoginCallbackRequest {
  code: string;
  state: string;
}
