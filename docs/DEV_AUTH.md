# Development Authentication Implementation

## Overview

This implementation replaces GitHub OAuth with GitHub Personal Access Token (PAT) authentication for development purposes. The OAuth implementation is preserved and can be restored later.

## Changes Made

### Backend Files

#### Modified Files

1. **`apps/backend/src/config/index.ts`**
   - Made `githubClientId` and `githubClientSecret` optional (they're not needed for dev login)
   - Added `githubToken` configuration field

2. **`apps/backend/src/app.ts`**
   - Added imports for `devRoutes` and `githubRoutes`
   - Mounted new routes:
     - `POST /api/v1/dev/login` - Development login endpoint
     - `GET /api/v1/github/repos` - GitHub repositories endpoint

3. **`apps/backend/src/features/auth/auth.service.ts`**
   - Added `loginWithToken()` method for PAT-based authentication
   - Reuses existing `fetchGitHubUser()`, `upsertUser()`, and `generateToken()` methods

4. **`.env`**
   - Added `GITHUB_TOKEN` environment variable
   - OAuth credentials remain for future use

#### New Files

5. **`apps/backend/src/features/dev/dev.controller.ts`**
   - `POST /api/v1/dev/login` endpoint
   - Reads `GITHUB_TOKEN` from environment
   - Validates token with GitHub API
   - Returns JWT and user profile

6. **`apps/backend/src/features/dev/dev.routes.ts`**
   - Route definitions for dev endpoints

7. **`apps/backend/src/features/github/github.controller.ts`**
   - `GET /api/v1/github/repos` endpoint
   - Requires JWT authentication
   - Fetches repositories using stored GitHub token
   - Supports query parameters for filtering and pagination

8. **`apps/backend/src/features/github/github.routes.ts`**
   - Route definitions for GitHub API endpoints

### Frontend Files

#### Modified Files

9. **`apps/frontend/src/api/auth.ts`**
   - Added `devLogin()` method for development authentication

10. **`apps/frontend/src/contexts/AuthContext.tsx`**
    - Updated `login()` to use dev login instead of OAuth redirect

11. **`apps/frontend/src/pages/LoginPage.tsx`**
    - Updated UI text to reflect development mode
    - Changed button text from "Continue with GitHub" to "Sign in with GitHub"

#### New Files

12. **`apps/frontend/src/api/github.ts`**
    - GitHub API client for fetching repositories
    - TypeScript interfaces for repository data

13. **`apps/frontend/src/hooks/useRepos.ts`**
    - React hook for fetching and caching repository data
    - Supports filtering and pagination options

### Test Files

14. **`tests/test-dev-login.ps1`**
    - PowerShell test script with curl-like commands
    - Tests all endpoints with expected responses

15. **`tests/postman-dev-login.json`**
    - Postman collection for manual testing
    - Includes environment variables for easy setup

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# GitHub Personal Access Token (required for dev login)
# Generate at: https://github.com/settings/tokens
# Required scopes: repo, read:user
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Explicit opt-in for the dev login endpoint (fail-closed).
# The endpoint is enabled ONLY when NODE_ENV=development AND this is "true".
# Production (NODE_ENV=production) can never enable it. Default: disabled.
ENABLE_DEV_LOGIN=true
```

> **Phase 0 security note:** `POST /api/v1/dev/login` and `GET /api/v1/dev/status`
> now return **404 unless both conditions above are met**. If you upgrade an
> existing dev environment and login suddenly returns 404, add
> `ENABLE_DEV_LOGIN=true` to your `.env`. Regression coverage:
> `node tests/test-dev-gate.mjs`.

### Generating a GitHub PAT

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control of private repositories)
   - `read:user` (read access to user profile)
4. Copy the generated token
5. Add it to `.env` as `GITHUB_TOKEN`

## API Endpoints

### POST /api/v1/dev/login

Development-only endpoint that authenticates using the server's `GITHUB_TOKEN`.

**Request:**
```bash
curl -X POST http://localhost:3001/api/v1/dev/login
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "clx1234567890",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
      "githubId": 123456,
      "githubLogin": "johndoe",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error (503):**
```json
{
  "success": false,
  "error": {
    "code": "GITHUB_TOKEN_NOT_CONFIGURED",
    "message": "GITHUB_TOKEN environment variable is not set",
    "statusCode": 503
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_GITHUB_TOKEN",
    "message": "The configured GITHUB_TOKEN is invalid or expired",
    "statusCode": 401
  }
}
```

### GET /api/v1/github/repos

Returns all repositories accessible with the authenticated user's GitHub token.

**Request:**
```bash
curl -H "Authorization: Bearer <JWT>" http://localhost:3001/api/v1/github/repos
```

**Query Parameters:**
- `type` (optional): `all`, `owner`, `public`, `private`, `member` (default: `all`)
- `sort` (optional): `created`, `updated`, `pushed`, `full_name` (default: `updated`)
- `direction` (optional): `asc`, `desc` (default: `desc`)
- `page` (optional): Page number (default: `1`)
- `per_page` (optional): Results per page (default: `30`, max: `100`)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 123456789,
      "name": "my-repo",
      "fullName": "johndoe/my-repo",
      "private": false,
      "url": "https://github.com/johndoe/my-repo",
      "description": "My awesome project",
      "fork": false,
      "language": "TypeScript",
      "stars": 42,
      "watchers": 5,
      "forks": 10,
      "openIssues": 3,
      "defaultBranch": "main",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T12:00:00.000Z",
      "pushedAt": "2024-01-15T11:30:00.000Z",
      "permissions": {
        "admin": true,
        "push": true,
        "pull": true
      }
    }
  ],
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "count": 1
  }
}
```

## Testing

### Quick Test

1. Start the backend:
   ```bash
   cd apps/backend
   pnpm dev
   ```

2. Run the test script:
   ```bash
   powershell -File tests/test-dev-login.ps1
   ```

### Manual Testing with cURL

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/dev/login | jq -r '.data.token')

# 2. Get user profile
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/auth/me

# 3. Get repositories
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/github/repos

# 4. Get repositories with filters
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/github/repos?type=owner&sort=full_name&per_page=5"
```

### Postman Testing

1. Import `tests/postman-dev-login.json` into Postman
2. Set the `baseUrl` variable to `http://localhost:3001/api/v1`
3. Run the "Dev Login" request first to get the auth token
4. The token is automatically saved to the `authToken` variable
5. Run other requests that require authentication

## Security Notes

- The `GITHUB_TOKEN` is never exposed in API responses
- The token is stored encrypted in the database
- All protected routes require a valid JWT
- The dev login endpoint is only for development use
- OAuth endpoints are preserved for production use

## Restoring OAuth

To restore OAuth authentication:

1. Remove the `GITHUB_TOKEN` from `.env`
2. Ensure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
3. Update the frontend `login()` function to use `authApi.initiateLogin()`
4. Restore the `AuthCallbackPage` route in `App.tsx`
5. Remove or disable the dev routes

## Files Not Modified

- `apps/backend/src/features/auth/auth.middleware.ts` - JWT verification unchanged
- `apps/backend/src/features/auth/auth.controller.ts` - OAuth endpoints preserved
- `apps/backend/src/features/auth/auth.routes.ts` - OAuth routes preserved
- `packages/shared/src/types/auth.ts` - Shared types unchanged
- `packages/db/prisma/schema.prisma` - Database schema unchanged
