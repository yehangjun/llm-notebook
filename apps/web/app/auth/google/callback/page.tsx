"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { AuthResponse, saveAuth } from "../../../../lib/auth";

function decodeBase64Url(raw: string): string {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isValidAuthResponse(value: unknown): value is AuthResponse {
  if (!value || typeof value !== "object") return false;
  const parsed = value as Record<string, unknown>;
  const token = parsed.token as Record<string, unknown> | undefined;
  const user = parsed.user as Record<string, unknown> | undefined;
  return Boolean(
    token &&
      user &&
      typeof token.access_token === "string" &&
      typeof token.refresh_token === "string" &&
      typeof token.expires_in === "number" &&
      typeof user.user_id === "string" &&
      typeof user.email === "string",
  );
}

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const payload = params.get("payload");
    if (!payload) {
      setError("Google 登录结果无效，请重试。");
      return;
    }

    try {
      const decoded = decodeBase64Url(payload);
      const parsed = JSON.parse(decoded);
      if (!isValidAuthResponse(parsed)) {
        throw new Error("invalid payload");
      }
      saveAuth(parsed);
      router.replace(parsed.user.is_admin ? "/admin" : "/feed");
    } catch {
      setError("Google 登录结果解析失败，请重试。");
    }
  }, [router]);

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[560px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Google 登录</CardTitle>
            <CardDescription>{error ? "登录未完成" : "正在完成登录..."}</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="space-y-4">
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                <Button onClick={() => router.replace("/auth")}>返回登录页</Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">请稍候，页面会自动跳转。</div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
