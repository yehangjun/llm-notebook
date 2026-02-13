"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";

type GenericResponse = { message: string };

export default function ResetPasswordClient() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<GenericResponse>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          new_password: newPassword,
          new_password_confirm: newPasswordConfirm,
        }),
      });
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 560 }}>
        <section className="card">
          <h1 style={{ marginTop: 0 }}>重置密码</h1>
          {!token && <div className="error">无效链接：缺少 token 参数</div>}
          <form className="form-stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="new-password">新密码</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-password-confirm">确认新密码</label>
              <input
                id="new-password-confirm"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                required
              />
            </div>
            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button className="btn" type="submit" disabled={loading || !token}>
                {loading ? "提交中..." : "重置密码"}
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
