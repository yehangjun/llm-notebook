"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { NoteListItem, NoteListResponse } from "../../lib/notes";

type StatusFilter = "" | "pending" | "running" | "succeeded" | "failed";
type VisibilityFilter = "" | "private" | "public";

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true)
      .then(() => fetchNotes({ status: "", visibility: "", keyword: "" }))
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchNotes({
    status,
    visibility,
    keyword: kw,
  }: {
    status: StatusFilter;
    visibility: VisibilityFilter;
    keyword: string;
  }) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (visibility) params.set("visibility", visibility);
      if (kw.trim()) params.set("keyword", kw.trim());
      const path = params.toString() ? `/notes?${params.toString()}` : "/notes";
      const data = await apiRequest<NoteListResponse>(path, {}, true);
      setNotes(data.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载笔记失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetchNotes({
      status: statusFilter,
      visibility: visibilityFilter,
      keyword,
    });
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>学习笔记</h1>
            <button className="btn" type="button" onClick={() => router.push("/notes/new")}>
              新建笔记
            </button>
          </div>

          <form className="row" onSubmit={onSearch} style={{ marginTop: 16 }}>
            <input
              style={{ flex: 1, minWidth: 220 }}
              placeholder="按标题、链接、心得搜索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="">全部状态</option>
              <option value="pending">待分析</option>
              <option value="running">分析中</option>
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
            </select>
            <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}>
              <option value="">全部可见性</option>
              <option value="private">私有</option>
              <option value="public">公开</option>
            </select>
            <button className="btn secondary" type="submit">
              查询
            </button>
          </form>

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          {loading && <div className="helper" style={{ marginTop: 12 }}>加载中...</div>}

          {!loading && notes.length === 0 && <div className="helper" style={{ marginTop: 12 }}>暂无笔记</div>}

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {notes.map((note) => (
              <article key={note.id} className="note-item">
                <div>
                  <h3 style={{ margin: "0 0 6px" }}>{note.source_title || note.source_url}</h3>
                  <div className="helper" style={{ fontSize: 13 }}>
                    {note.source_domain} · 更新于 {new Date(note.updated_at).toLocaleString()}
                  </div>
                </div>
                <div className="row" style={{ alignItems: "center" }}>
                  <span className={`pill status-${note.analysis_status}`}>{renderStatus(note.analysis_status)}</span>
                  <span className="pill">{note.visibility === "public" ? "公开" : "私有"}</span>
                  <button className="btn secondary" type="button" onClick={() => router.push(`/notes/${note.id}`)}>
                    查看
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function renderStatus(status: NoteListItem["analysis_status"]): string {
  if (status === "pending") return "待分析";
  if (status === "running") return "分析中";
  if (status === "succeeded") return "成功";
  return "失败";
}
