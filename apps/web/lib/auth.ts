export type UserPublic = {
  user_id: string;
  email: string;
  nickname: string | null;
  ui_language: string;
  is_admin: boolean;
  created_at: string;
};

export type AuthResponse = {
  user: UserPublic;
  token: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
};

const ACCESS_TOKEN_KEY = "llm_access_token";
const REFRESH_TOKEN_KEY = "llm_refresh_token";
const USER_KEY = "llm_user";

export function saveAuth(auth: AuthResponse): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, auth.token.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, auth.token.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): UserPublic | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserPublic>;
    if (!parsed.user_id || !parsed.email || !parsed.ui_language || !parsed.created_at) {
      return null;
    }
    return {
      user_id: parsed.user_id,
      email: parsed.email,
      nickname: parsed.nickname ?? null,
      ui_language: parsed.ui_language,
      is_admin: Boolean(parsed.is_admin),
      created_at: parsed.created_at,
    };
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserPublic): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
