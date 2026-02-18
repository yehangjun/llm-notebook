"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";
import {
  clearAuth,
  getRefreshToken,
  getStoredUser,
  setStoredUser,
  UserPublic,
} from "../../lib/auth";

type GenericResponse = { message: string };

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
      <main className="page">
        <div className="container" style={{ maxWidth: 560 }}>
          <section className="card">加载中...</section>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 560 }}>
        <section className="card">
          <h1 style={{ marginTop: 0 }}>个人资料</h1>
          <form className="form-stack" onSubmit={onSave}>
            <div className="field">
              <label>ID</label>
              <input value={user.user_id} disabled />
            </div>
            <div className="field">
              <label>邮箱</label>
              <input value={user.email} disabled />
            </div>
            <div className="field">
              <label htmlFor="nickname">昵称</label>
              <input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lang">界面语言</label>
              <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
              </select>
            </div>
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <div className="row">
              {user.is_admin && (
                <button className="btn secondary" type="button" onClick={() => router.push("/admin")}>
                  管理后台
                </button>
              )}
              <button className="btn" type="submit">
                保存
              </button>
              <button className="btn danger" type="button" onClick={onLogout}>
                退出登录
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
