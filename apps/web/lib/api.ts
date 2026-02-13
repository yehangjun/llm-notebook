import { API_BASE_URL } from "./config";
import { getAccessToken } from "./auth";

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  withAuth = false,
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  if (withAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data && (data.detail as string)) || "请求失败";
    throw new Error(detail);
  }

  return data as T;
}
