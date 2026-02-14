"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../../lib/api";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";

type AdminNoteItem = {
  id: string;
  owner_user_id: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  visibility: "private" | "public";
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  updated_at: string;
};

type AdminNoteListResponse = { notes: AdminNoteItem[] };

export default function AdminNotesPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [notes, setNotes] = useState<AdminNoteItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingNoteId, setDeletingNoteId] = useState("");

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      setMe(cached);
    }

    apiRequest<UserPublic>("/me", {}, true)
      .then((user) => {
        if (!user.is_admin) {
          setError("你不是管理员，无法访问管理系统");
          setLoading(false);
          return;
        }
        setMe(user);
        setStoredUser(user);
        void fetchNotes("");
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchNotes(q: string) {
    setLoading(true);
    setError("");
    try {
      const encoded = q ? `?keyword=${encodeURIComponent(q)}` : "";
      const data = await apiRequest<AdminNoteListResponse>(`/admin/notes${encoded}`, {}, true);
      setNotes(data.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载笔记失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = keyword.trim();
    setQuery(q);
    await fetchNotes(q);
  }

  async function onDeleteNote(noteId: string) {
    if (!window.confirm("确认删除这条笔记吗？删除后不可恢复。")) {
      return;
    }

    setSuccess("");
    setError("");
    setDeletingNoteId(noteId);
    try {
      await apiRequest<{ message: string }>(`/admin/notes/${noteId}`, { method: "DELETE" }, true);
      setSuccess("已删除笔记");
      await fetchNotes(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingNoteId("");
    }
  }

  const canRender = useMemo(() => Boolean(me?.is_admin), [me]);

  if (loading && notes.length === 0) {
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
            <h1 style={{ marginTop: 0 }}>管理系统</h1>
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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>管理系统 · 笔记管理</h1>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => router.push("/admin/users")}>
                用户管理
              </button>
              <button className="btn secondary" type="button" onClick={() => router.push("/profile")}>
                返回资料页
              </button>
            </div>
          </div>

          <form className="row" onSubmit={onSearch} style={{ marginTop: 16 }}>
            <input
              style={{ flex: 1, minWidth: 220 }}
              placeholder="按用户ID、标题、链接、心得搜索"
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
                  <th>笔记ID</th>
                  <th>所属用户</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>可见性</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.id}>
                    <td>{note.id}</td>
                    <td>{note.owner_user_id}</td>
                    <td>
                      <div style={{ maxWidth: 420 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{note.source_title || "(无标题)"}</div>
                        <a href={note.source_url} target="_blank" rel="noreferrer">
                          {note.source_url}
                        </a>
                      </div>
                    </td>
                    <td>{renderStatus(note.analysis_status)}</td>
                    <td>{note.visibility === "public" ? "公开" : "私有"}</td>
                    <td>{new Date(note.updated_at).toLocaleString()}</td>
                    <td>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        disabled={deletingNoteId === note.id}
                      >
                        {deletingNoteId === note.id ? "删除中..." : "删除"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function renderStatus(status: AdminNoteItem["analysis_status"]): string {
  if (status === "pending") return "待分析";
  if (status === "running") return "分析中";
  if (status === "succeeded") return "成功";
  return "失败";
}
