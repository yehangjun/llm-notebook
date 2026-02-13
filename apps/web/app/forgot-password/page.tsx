"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { apiRequest } from "../../lib/api";

type GenericResponse = { message: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<GenericResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 560 }}>
        <section className="card">
          <h1 style={{ marginTop: 0 }}>忘记密码</h1>
          <form className="form-stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">邮箱</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button className="btn" type="submit" disabled={loading}>
                {loading ? "提交中..." : "发送重置邮件"}
              </button>
              <Link className="btn secondary" href="/auth">
                返回登录
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
