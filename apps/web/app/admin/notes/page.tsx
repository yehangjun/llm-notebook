"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../../lib/api";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";
import AdminTabs from "../../../components/AdminTabs";

type AdminNoteItem = {
  id: string;
  owner_user_id: string;
  owner_is_deleted: boolean;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  visibility: "private" | "public";
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  is_deleted: boolean;
  deleted_at: string | null;
  updated_at: string;
};

type AdminNoteListResponse = { notes: AdminNoteItem[] };
type AdminStatusFilter = "" | "pending" | "running" | "succeeded" | "failed";
type AdminVisibilityFilter = "" | "private" | "public";
type AdminDeletedFilter = "all" | "active" | "deleted";

type NotesQueryState = {
  keyword: string;
  ownerUserId: string;
  status: AdminStatusFilter;
  visibility: AdminVisibilityFilter;
  deleted: AdminDeletedFilter;
};

const DEFAULT_QUERY: NotesQueryState = {
  keyword: "",
  ownerUserId: "",
  status: "",
  visibility: "",
  deleted: "all",
};

export default function AdminNotesPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [notes, setNotes] = useState<AdminNoteItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>("");
  const [visibilityFilter, setVisibilityFilter] = useState<AdminVisibilityFilter>("");
  const [deletedFilter, setDeletedFilter] = useState<AdminDeletedFilter>("all");
  const [query, setQuery] = useState<NotesQueryState>(DEFAULT_QUERY);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingNoteId, setActingNoteId] = useState("");

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
        void fetchNotes(DEFAULT_QUERY);
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchNotes(q: NotesQueryState) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.keyword) params.set("keyword", q.keyword);
      if (q.ownerUserId) params.set("owner_user_id", q.ownerUserId);
      if (q.status) params.set("status", q.status);
      if (q.visibility) params.set("visibility", q.visibility);
      params.set("deleted", q.deleted);
      const path = params.toString() ? `/admin/notes?${params.toString()}` : "/admin/notes";
      const data = await apiRequest<AdminNoteListResponse>(path, {}, true);
      setNotes(data.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载笔记失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextQuery: NotesQueryState = {
      keyword: keyword.trim(),
      ownerUserId: ownerUserId.trim(),
      status: statusFilter,
      visibility: visibilityFilter,
      deleted: deletedFilter,
    };
    setQuery(nextQuery);
    await fetchNotes(nextQuery);
  }

  async function onDeleteNote(noteId: string) {
    if (!window.confirm("确认删除这条笔记吗？删除后可在管理后台恢复。")) {
      return;
    }

    setSuccess("");
    setError("");
    setActingNoteId(noteId);
    try {
      await apiRequest<{ message: string }>(`/admin/notes/${noteId}`, { method: "DELETE" }, true);
      setSuccess("已删除笔记");
      await fetchNotes(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActingNoteId("");
    }
  }

  async function onRestoreNote(noteId: string) {
    setSuccess("");
    setError("");
    setActingNoteId(noteId);
    try {
      await apiRequest<{ message: string }>(`/admin/notes/${noteId}/restore`, { method: "POST" }, true);
      setSuccess("已恢复笔记");
      await fetchNotes(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setActingNoteId("");
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
          <h1 style={{ margin: 0 }}>管理后台 · 笔记管理</h1>
          <AdminTabs />

          <form className="row" onSubmit={onSearch} style={{ marginTop: 16 }}>
            <input
              style={{ flex: 1, minWidth: 200 }}
              placeholder="按用户ID、标题、链接、心得搜索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <input
              style={{ minWidth: 160 }}
              placeholder="所属用户ID"
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AdminStatusFilter)}>
              <option value="">全部状态</option>
              <option value="pending">待分析</option>
              <option value="running">分析中</option>
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
            </select>
            <select
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value as AdminVisibilityFilter)}
            >
              <option value="">全部可见性</option>
              <option value="private">私有</option>
              <option value="public">公开</option>
            </select>
            <select value={deletedFilter} onChange={(e) => setDeletedFilter(e.target.value as AdminDeletedFilter)}>
              <option value="all">全部删除状态</option>
              <option value="active">未删除</option>
              <option value="deleted">已删除</option>
            </select>
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
                  <th>删除状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.id}>
                    <td>{note.id}</td>
                    <td>
                      {note.owner_user_id}
                      {note.owner_is_deleted ? "（用户已删除）" : ""}
                    </td>
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
                    <td>{note.is_deleted ? `已删除${note.deleted_at ? `（${new Date(note.deleted_at).toLocaleString()}）` : ""}` : "未删除"}</td>
                    <td>{new Date(note.updated_at).toLocaleString()}</td>
                    <td>
                      {!note.is_deleted && (
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => onDeleteNote(note.id)}
                          disabled={actingNoteId === note.id}
                        >
                          {actingNoteId === note.id ? "处理中..." : "删除"}
                        </button>
                      )}
                      {note.is_deleted && (
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => onRestoreNote(note.id)}
                          disabled={actingNoteId === note.id || note.owner_is_deleted}
                        >
                          {actingNoteId === note.id ? "处理中..." : "恢复"}
                        </button>
                      )}
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
