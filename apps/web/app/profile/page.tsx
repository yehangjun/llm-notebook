"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { apiRequest } from "../../lib/api";
import {
  clearAuth,
  getRefreshToken,
  getStoredUser,
  setStoredUser,
  UserPublic,
} from "../../lib/auth";

type GenericResponse = { message: string };
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [nickname, setNickname] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      setUser(cached);
      setNickname(cached.nickname ?? "");
      setLanguage(cached.ui_language);
    }

    apiRequest<UserPublic>("/me", {}, true)
      .then((me) => {
        setUser(me);
        setNickname(me.nickname ?? "");
        setLanguage(me.ui_language);
        setStoredUser(me);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "请先登录");
        clearAuth();
        router.push("/auth");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const me = await apiRequest<UserPublic>(
        "/me",
        {
          method: "PATCH",
          body: JSON.stringify({ nickname, ui_language: language }),
        },
        true,
      );
      setUser(me);
      setStoredUser(me);
      setSuccess("保存成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function onLogout() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await apiRequest<GenericResponse>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch {
      // ignore
    }
    clearAuth();
    router.push("/");
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[640px]">
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[640px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">个人资料</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSave}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">ID</label>
                <Input value={user.user_id} disabled />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">邮箱</label>
                <Input value={user.email} disabled />
              </div>
              <div className="space-y-2">
                <label htmlFor="nickname" className="text-sm font-medium text-foreground">
                  昵称
                </label>
                <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label htmlFor="lang" className="text-sm font-medium text-foreground">
                  界面语言
                </label>
                <select id="lang" className={SELECT_CLASS} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
              <div className="flex flex-wrap gap-2">
                {user.is_admin && (
                  <Button variant="secondary" type="button" onClick={() => router.push("/admin")}>
                    管理后台
                  </Button>
                )}
                <Button type="submit">保存</Button>
                <Button variant="destructive" type="button" onClick={onLogout}>
                  退出登录
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
