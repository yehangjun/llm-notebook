"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { apiRequest } from "../../lib/api";
import { AuthResponse, saveAuth } from "../../lib/auth";

type Tab = "login" | "register";

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
      router.push("/profile");
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

    try {
      const data = await apiRequest<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          email,
          password,
          password_confirm: passwordConfirm,
          nickname,
          ui_language: language,
        }),
      });
      saveAuth(data);
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 560 }}>
        <section className="card">
          <h1 style={{ marginTop: 0 }}>登录与注册</h1>
          <div className="tabs">
            <button
              className={`tab ${tab === "login" ? "active" : ""}`}
              onClick={() => setTab("login")}
              type="button"
            >
              登录
            </button>
            <button
              className={`tab ${tab === "register" ? "active" : ""}`}
              onClick={() => setTab("register")}
              type="button"
            >
              注册
            </button>
          </div>

          {tab === "login" ? (
            <form className="form-stack" onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="principal">ID 或邮箱</label>
                <input
                  id="principal"
                  value={loginPrincipal}
                  onChange={(e) => setLoginPrincipal(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">密码</label>
                <input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error">{error}</div>}
              <div className="row">
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? "提交中..." : "登录"}
                </button>
                <Link className="btn secondary" href="/forgot-password">
                  忘记密码
                </Link>
              </div>
            </form>
          ) : (
            <form className="form-stack" onSubmit={handleRegister}>
              <div className="field">
                <label htmlFor="user-id">ID</label>
                <input id="user-id" value={userId} onChange={(e) => setUserId(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="email">邮箱</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">密码</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password-confirm">确认密码</label>
                <input
                  id="password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="nickname">昵称（可选）</label>
                <input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="language">界面语言</label>
                <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn" type="submit" disabled={loading}>
                {loading ? "提交中..." : "注册"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
