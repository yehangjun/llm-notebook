"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../../lib/api";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";
import AdminTabs from "../../../components/AdminTabs";

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
      <main className="page">
        <div className="container">
          <section className="card">加载中...</section>
        </div>
      </main>
    );
  }

  if (!canRender) {
    return (
      <main className="page">
        <div className="container">
          <section className="card">
            <h1 style={{ marginTop: 0 }}>管理后台</h1>
            <div className="error">{error || "无权限"}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn secondary" type="button" onClick={() => router.push("/")}>
                返回首页
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card">
          <h1 style={{ margin: 0 }}>管理后台 · 用户账号管理</h1>
          <AdminTabs />

          <form className="row" onSubmit={onSearch} style={{ marginTop: 16 }}>
            <input
              style={{ flex: 1, minWidth: 220 }}
              placeholder="按 ID / 邮箱 / 昵称搜索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button className="btn" type="submit">
              搜索
            </button>
          </form>

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          {success && <div className="success" style={{ marginTop: 12 }}>{success}</div>}

          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>邮箱</th>
                  <th>昵称</th>
                  <th>语言</th>
                  <th>管理员</th>
                  <th>注册时间</th>
                  <th>操作</th>
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
                    <tr key={user.user_id}>
                      <td>{user.user_id}</td>
                      <td>{user.email}</td>
                      <td>
                        <input
                          value={draft.nickname}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [user.user_id]: { ...draft, nickname: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
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
                      <td>
                        <input
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
                      <td>{new Date(user.created_at).toLocaleString()}</td>
                      <td>
                        <button className="btn" type="button" onClick={() => onSave(user.user_id)}>
                          保存
                        </button>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => onDeleteUser(user.user_id)}
                          disabled={deletingUserId === user.user_id || me?.user_id === user.user_id}
                          style={{ marginLeft: 8 }}
                        >
                          {deletingUserId === user.user_id ? "删除中..." : "删除"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
