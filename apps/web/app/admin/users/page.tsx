"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AdminTabs from "../../../components/AdminTabs";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { apiRequest } from "../../../lib/api";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";

type AdminUserItem = {
  user_id: string;
  email: string;
  nickname: string | null;
  ui_language: string;
  is_admin: boolean;
  created_at: string;
};

type AdminUserListResponse = { users: AdminUserItem[] };

type DraftState = Record<
  string,
  {
    nickname: string;
    ui_language: string;
    is_admin: boolean;
  }
>;

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-white px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState("");

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      setMe(cached);
    }

    apiRequest<UserPublic>("/me", {}, true)
      .then((user) => {
        if (!user.is_admin) {
          setError("你不是管理员，无法访问管理后台");
          setLoading(false);
          return;
        }
        setMe(user);
        setStoredUser(user);
        void fetchUsers("");
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchUsers(q: string) {
    setLoading(true);
    setError("");
    try {
      const encoded = q ? `?keyword=${encodeURIComponent(q)}` : "";
      const data = await apiRequest<AdminUserListResponse>(`/admin/users${encoded}`, {}, true);
      setUsers(data.users);
      const nextDrafts: DraftState = {};
      for (const user of data.users) {
        nextDrafts[user.user_id] = {
          nickname: user.nickname ?? "",
          ui_language: user.ui_language,
          is_admin: user.is_admin,
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载用户失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQuery(keyword.trim());
    await fetchUsers(keyword.trim());
  }

  async function onSave(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;

    setSuccess("");
    setError("");
    try {
      await apiRequest<AdminUserItem>(
        `/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            nickname: draft.nickname,
            ui_language: draft.ui_language,
            is_admin: draft.is_admin,
          }),
        },
        true,
      );
      setSuccess(`已更新用户 ${userId}`);
      await fetchUsers(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function onDeleteUser(userId: string) {
    if (!window.confirm(`确认删除用户 ${userId} 吗？该用户及其笔记会被逻辑删除。`)) {
      return;
    }

    setSuccess("");
    setError("");
    setDeletingUserId(userId);
    try {
      await apiRequest<{ message: string }>(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }, true);
      setSuccess(`已删除用户 ${userId}`);
      await fetchUsers(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingUserId("");
    }
  }

  const canRender = useMemo(() => Boolean(me?.is_admin), [me]);

  if (loading && users.length === 0) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[1080px]">
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!canRender) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[1080px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">管理后台</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "无权限"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/")}>
                返回首页
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[1080px]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">管理后台 · 用户账号管理</CardTitle>
            <AdminTabs />
          </CardHeader>

          <CardContent className="space-y-4">
            <form className="grid gap-2 md:grid-cols-[1fr_auto]" onSubmit={onSearch}>
              <Input
                placeholder="按 ID / 邮箱 / 昵称搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Button type="submit">搜索</Button>
            </form>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">ID</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">邮箱</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">昵称</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">语言</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">管理员</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">注册时间</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const draft = drafts[user.user_id] || {
                      nickname: user.nickname ?? "",
                      ui_language: user.ui_language,
                      is_admin: user.is_admin,
                    };
                    return (
                      <tr key={user.user_id} className="odd:bg-white even:bg-muted/20">
                        <td className="border-b border-border px-3 py-2">{user.user_id}</td>
                        <td className="border-b border-border px-3 py-2">{user.email}</td>
                        <td className="border-b border-border px-3 py-2">
                          <Input
                            value={draft.nickname}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [user.user_id]: { ...draft, nickname: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="border-b border-border px-3 py-2">
                          <select
                            className={SELECT_CLASS}
                            value={draft.ui_language}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [user.user_id]: { ...draft, ui_language: e.target.value },
                              }))
                            }
                          >
                            <option value="zh-CN">中文</option>
                            <option value="en-US">English</option>
                          </select>
                        </td>
                        <td className="border-b border-border px-3 py-2">
                          <input
                            className="h-4 w-4 accent-blue-600"
                            type="checkbox"
                            checked={draft.is_admin}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [user.user_id]: { ...draft, is_admin: e.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td className="border-b border-border px-3 py-2">{new Date(user.created_at).toLocaleString()}</td>
                        <td className="border-b border-border px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" type="button" onClick={() => onSave(user.user_id)}>
                              保存
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => onDeleteUser(user.user_id)}
                              disabled={deletingUserId === user.user_id || me?.user_id === user.user_id}
                            >
                              {deletingUserId === user.user_id ? "删除中..." : "删除"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
