"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { FeedItem, FeedListResponse } from "../../lib/feed";
import { NoteListItem, NoteListResponse } from "../../lib/notes";

type NotesTab = "notes" | "bookmarks";
type StatusFilter = "" | "pending" | "running" | "succeeded" | "failed";
type VisibilityFilter = "" | "private" | "public";

export default function NotesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<NotesTab>("notes");
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [bookmarks, setBookmarks] = useState<FeedItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");

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

  async function fetchBookmarks() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<FeedListResponse>("/feed/bookmarks?limit=100", {}, true);
      setBookmarks(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载收藏失败");
    } finally {
      setLoading(false);
    }
  }

  async function switchTab(nextTab: NotesTab) {
    if (tab === nextTab) return;
    setTab(nextTab);
    if (nextTab === "notes") {
      await fetchNotes({
        status: statusFilter,
        visibility: visibilityFilter,
        keyword,
      });
      return;
    }
    await fetchBookmarks();
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetchNotes({
      status: statusFilter,
      visibility: visibilityFilter,
      keyword,
    });
  }

  async function onToggleBookmark(item: FeedItem) {
    setActingId(`bookmark:${item.item_type}:${item.id}`);
    setError("");
    try {
      const method = item.bookmarked ? "DELETE" : "POST";
      const path =
        item.item_type === "note"
          ? `/social/bookmarks/notes/${item.id}`
          : `/social/bookmarks/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchBookmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  function openBookmark(item: FeedItem) {
    router.push(`/feed/items/${item.item_type}/${item.id}`);
  }

  function formatPublishedAt(item: { published_at: string | null; updated_at: string }) {
    return new Date(item.published_at ?? item.updated_at).toLocaleString();
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

          <div className="tabs" style={{ marginTop: 16 }}>
            <button className={tab === "notes" ? "tab active" : "tab"} type="button" onClick={() => void switchTab("notes")}>
              笔记
            </button>
            <button className={tab === "bookmarks" ? "tab active" : "tab"} type="button" onClick={() => void switchTab("bookmarks")}>
              收藏
            </button>
          </div>

          {tab === "notes" && (
            <form className="row" onSubmit={onSearch}>
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
          )}

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          {loading && <div className="helper" style={{ marginTop: 12 }}>加载中...</div>}

          {!loading && tab === "notes" && notes.length === 0 && <div className="helper" style={{ marginTop: 12 }}>暂无笔记</div>}
          {!loading && tab === "bookmarks" && bookmarks.length === 0 && <div className="helper" style={{ marginTop: 12 }}>暂无收藏</div>}

          {tab === "notes" && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {notes.map((note) => (
                <article key={note.id} className="note-item">
                  <div>
                    <h3 style={{ margin: "0 0 6px" }}>{note.source_title || note.source_url}</h3>
                    <div className="helper" style={{ fontSize: 13 }}>
                      {note.source_domain} · 发布时间 {formatPublishedAt(note)}
                    </div>
                    {!!note.tags.length && (
                      <div className="row" style={{ marginTop: 8 }}>
                        {note.tags.map((item) => (
                          <span key={`${note.id}-${item}`} className="pill">
                            #{item}
                          </span>
                        ))}
                      </div>
                    )}
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
          )}

          {tab === "bookmarks" && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {bookmarks.map((item) => (
                <article key={`${item.item_type}-${item.id}`} className="note-item">
                  <div>
                    <h3 style={{ margin: "0 0 6px" }}>{item.source_title || item.source_url}</h3>
                    <div className="helper" style={{ fontSize: 13 }}>
                      {item.creator_name} · {item.source_domain} · 发布时间 {formatPublishedAt(item)}
                    </div>
                    {!!item.tags.length && (
                      <div className="row" style={{ marginTop: 8 }}>
                        {item.tags.map((tagItem) => (
                          <span key={`${item.id}-${tagItem}`} className="pill">
                            #{tagItem}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {item.summary_excerpt && <p className="summary-block" style={{ margin: 0 }}>{item.summary_excerpt}</p>}
                  <div className="row" style={{ alignItems: "center" }}>
                    <span className="pill">{item.bookmark_count} 收藏</span>
                    <span className="pill">{item.like_count} 点赞</span>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={actingId === `bookmark:${item.item_type}:${item.id}`}
                      onClick={() => void onToggleBookmark(item)}
                    >
                      {item.bookmarked ? "取消收藏" : "收藏"}
                    </button>
                    <button className="btn" type="button" onClick={() => openBookmark(item)}>
                      查看
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
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
