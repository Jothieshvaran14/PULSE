import jwt from "jsonwebtoken";
import { config } from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { AppError, ValidationError } from "../../lib/errors.js";

// =============================================================================
// Types
// =============================================================================

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface JwtPayload {
  sub: string; // userId
  githubId: number;
  githubLogin: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  githubId: number;
  githubLogin: string;
  createdAt: Date;
}

// =============================================================================
// Auth Service
// =============================================================================

class AuthService {
  /**
   * Generate the GitHub authorization URL with CSRF state parameter.
   *
   * The state parameter prevents CSRF attacks during the OAuth callback.
   * We use crypto.randomBytes for cryptographic randomness.
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.githubClientId || "",
      redirect_uri: `${config.frontendUrl}/auth/callback`,
      scope: "read:user user:email repo",
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange the OAuth code for an access token, then fetch the user profile.
   *
   * Flow:
   * 1. POST to GitHub's token endpoint with code + client secret
   * 2. Use the access token to fetch user profile from GitHub API
   * 3. Upsert user in database (create or update)
   * 4. Generate and return our own JWT
   */
  async handleCallback(code: string): Promise<{
    token: string;
    user: AuthUser;
  }> {
    // Step 1: Exchange code for access token
    const tokenResponse = await this.exchangeCodeForToken(code);
    const accessToken = tokenResponse.access_token;

    // Step 2: Fetch GitHub user profile
    const githubUser = await this.fetchGitHubUser(accessToken);

    // Step 3: Upsert user in database
    const user = await this.upsertUser(githubUser, accessToken);

    // Step 4: Generate JWT
    const token = this.generateToken(user);

    return { token, user };
  }

  /**
   * Exchange the OAuth authorization code for a GitHub access token.
   *
   * This happens server-side — the client secret is never exposed to the browser.
   */
  private async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "GitHub token exchange failed");
      throw new AppError(
        "Failed to authenticate with GitHub",
        502,
        "GITHUB_TOKEN_EXCHANGE_FAILED"
      );
    }

    const data = (await response.json()) as GitHubTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      logger.error({ error: data.error, description: data.error_description }, "GitHub OAuth error");
      throw new ValidationError(
        data.error_description || "Invalid authorization code"
      );
    }

    return data;
  }

  /**
   * Fetch the authenticated user's profile from GitHub API.
   */
  private async fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "RYME-Platform",
      },
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "Failed to fetch GitHub user");
      throw new AppError(
        "Failed to fetch user profile from GitHub",
        502,
        "GITHUB_USER_FETCH_FAILED"
      );
    }

    return (await response.json()) as GitHubUser;
  }

  /**
   * Create or update user in the database.
   *
   * Uses upsert to handle both new users and returning users.
   * The access token is encrypted before storage.
   */
  private async upsertUser(
    githubUser: GitHubUser,
    accessToken: string
  ): Promise<AuthUser> {
    const encryptedToken = encrypt(accessToken);

    const user = await prisma.user.upsert({
      where: { githubId: githubUser.id },
      create: {
        githubId: githubUser.id,
        githubLogin: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        accessTokenEncrypted: encryptedToken,
      },
      update: {
        githubLogin: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        accessTokenEncrypted: encryptedToken,
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      githubId: user.githubId,
      githubLogin: user.githubLogin,
      createdAt: user.createdAt,
    };
  }

  /**
   * Generate a signed JWT for the user.
   *
   * The token contains minimal claims (userId, githubId, githubLogin)
   * and is signed with the server's secret key.
   */
  private generateToken(user: AuthUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      githubId: user.githubId,
      githubLogin: user.githubLogin,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = { expiresIn: config.jwtExpiresIn };
    return jwt.sign(payload, config.jwtSecret, options);
  }

  /**
   * Verify and decode a JWT.
   *
   * Returns the decoded payload or throws if invalid/expired.
   */
  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  }

  /**
   * Login using a GitHub Personal Access Token.
   *
   * Development-only flow:
   * 1. Call GitHub API with the PAT to fetch user profile
   * 2. Upsert user in database
   * 3. Generate and return our own JWT
   */
  async loginWithToken(accessToken: string): Promise<{
    token: string;
    user: AuthUser;
  }> {
    const githubUser = await this.fetchGitHubUser(accessToken);
    const user = await this.upsertUser(githubUser, accessToken);
    const token = this.generateToken(user);
    return { token, user };
  }

  /**
   * Get user by ID.
   */
  async getUserById(userId: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        githubId: true,
        githubLogin: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Get the decrypted GitHub access token for a user.
   *
   * Used when making GitHub API calls on behalf of the user.
   */
  async getDecryptedToken(userId: string): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { accessTokenEncrypted: true },
    });

    return decrypt(user.accessTokenEncrypted);
  }
}

export const authService = new AuthService();
