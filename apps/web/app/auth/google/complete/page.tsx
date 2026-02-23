"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { apiRequest } from "../../../../lib/api";
import { AuthResponse, saveAuth } from "../../../../lib/auth";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function GoogleCompletePage() {
  const router = useRouter();
  const [ticket, setTicket] = useState("");
  const [email, setEmail] = useState("");

  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const disabled = useMemo(() => !ticket || !email || loading, [email, loading, ticket]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTicket = params.get("ticket") ?? "";
    const nextEmail = params.get("email") ?? "";
    const suggestedName = params.get("name") ?? "";
    setTicket(nextTicket);
    setEmail(nextEmail);
    if (suggestedName) {
      setNickname((current) => current || suggestedName);
    }
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket) {
      setError("Google 登录信息已失效，请重新登录。");
      return;
    }
    if (!email) {
      setError("缺少邮箱信息，请重新登录。");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<AuthResponse>("/auth/sso/google/complete", {
        method: "POST",
        body: JSON.stringify({
          sso_ticket: ticket,
          user_id: userId,
          nickname: nickname || null,
          ui_language: language,
        }),
      });
      saveAuth(data);
      router.replace(data.user.is_admin ? "/admin" : "/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google 登录补全失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[640px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">完成 Google 登录</CardTitle>
            <CardDescription>首次使用 Google 登录，请补全账号信息后继续。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  邮箱
                </label>
                <Input id="email" value={email} readOnly />
              </div>

              <div className="space-y-2">
                <label htmlFor="user-id" className="text-sm font-medium text-foreground">
                  ID
                </label>
                <Input
                  id="user-id"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="4-32 位字母/数字/下划线"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="nickname" className="text-sm font-medium text-foreground">
                  昵称（可选）
                </label>
                <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label htmlFor="language" className="text-sm font-medium text-foreground">
                  界面语言
                </label>
                <select id="language" className={SELECT_CLASS} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>

              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

              <Button type="submit" disabled={disabled}>
                {loading ? "提交中..." : "完成并进入系统"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
