"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { buttonVariants, Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiRequest } from "../../lib/api";
import { AuthResponse, saveAuth } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";

type Tab = "login" | "register";
type GenericResponse = { message: string };
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [loginPrincipal, setLoginPrincipal] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [emailCode, setEmailCode] = useState("");
  const [registerMessage, setRegisterMessage] = useState("");
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [sendCodeCountdown, setSendCodeCountdown] = useState(0);

  useEffect(() => {
    if (sendCodeCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setSendCodeCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [sendCodeCountdown]);

  useEffect(() => {
    const redirectError = new URLSearchParams(window.location.search).get("error");
    if (redirectError) {
      setError(redirectError);
    }
  }, []);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          principal: loginPrincipal,
          password: loginPassword,
        }),
      });
      saveAuth(data);
      router.push(getPostLoginTarget(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setRegisterMessage("");

    try {
      const data = await apiRequest<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          email,
          email_code: emailCode,
          password,
          password_confirm: passwordConfirm,
          nickname,
          ui_language: language,
        }),
      });
      saveAuth(data);
      router.push(getPostLoginTarget(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmailCode() {
    if (!email.trim()) {
      setError("请先填写邮箱");
      return;
    }

    setSendCodeLoading(true);
    setError("");
    setRegisterMessage("");

    try {
      const data = await apiRequest<GenericResponse>("/auth/send-register-email-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setRegisterMessage(data.message);
      setSendCodeCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
    } finally {
      setSendCodeLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[640px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">登录与注册</CardTitle>
            <CardDescription>使用 ID 或邮箱登录，首次使用请先注册账号。</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="register">注册</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <label htmlFor="principal" className="text-sm font-medium text-foreground">
                      ID 或邮箱
                    </label>
                    <Input
                      id="principal"
                      value={loginPrincipal}
                      onChange={(e) => setLoginPrincipal(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="login-password" className="text-sm font-medium text-foreground">
                      密码
                    </label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={loading}>
                      {loading ? "提交中..." : "登录"}
                    </Button>
                    <Link className={buttonVariants({ variant: "secondary" })} href="/forgot-password">
                      忘记密码
                    </Link>
                  </div>
                  <a className={`${buttonVariants({ variant: "secondary" })} w-full`} href={`${API_BASE_URL}/auth/sso/google/start`}>
                    使用 Google 账号登录
                  </a>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div className="space-y-2">
                    <label htmlFor="user-id" className="text-sm font-medium text-foreground">
                      ID
                    </label>
                    <Input id="user-id" value={userId} onChange={(e) => setUserId(e.target.value)} required />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                      邮箱
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="sm:flex-1"
                        required
                      />
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={handleSendEmailCode}
                        disabled={sendCodeLoading || sendCodeCountdown > 0}
                      >
                        {sendCodeLoading
                          ? "发送中..."
                          : sendCodeCountdown > 0
                            ? `${sendCodeCountdown}s 后重试`
                            : "发送验证码"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email-code" className="text-sm font-medium text-foreground">
                      邮箱验证码
                    </label>
                    <Input
                      id="email-code"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-foreground">
                      密码
                    </label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password-confirm" className="text-sm font-medium text-foreground">
                      确认密码
                    </label>
                    <Input
                      id="password-confirm"
                      type="password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
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

                  {registerMessage && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {registerMessage}
                    </div>
                  )}
                  {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                  <Button type="submit" disabled={loading}>
                    {loading ? "提交中..." : "注册"}
                  </Button>
                  <a className={`${buttonVariants({ variant: "secondary" })} w-full`} href={`${API_BASE_URL}/auth/sso/google/start`}>
                    使用 Google 账号登录
                  </a>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function getPostLoginTarget(auth: AuthResponse): string {
  if (auth.user.is_admin) {
    return "/admin";
  }
  return "/feed";
}
