"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { buttonVariants, Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
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
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[640px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">重置密码</CardTitle>
          </CardHeader>
          <CardContent>
            {!token && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">无效链接：缺少 token 参数</div>}
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label htmlFor="new-password" className="text-sm font-medium text-foreground">
                  新密码
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-password-confirm" className="text-sm font-medium text-foreground">
                  确认新密码
                </label>
                <Input
                  id="new-password-confirm"
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  required
                />
              </div>
              {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading || !token}>
                  {loading ? "提交中..." : "重置密码"}
                </Button>
                <Link className={buttonVariants({ variant: "secondary" })} href="/auth">
                  返回登录
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
