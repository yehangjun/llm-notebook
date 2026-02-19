"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import AnalysisStatusBadge from "../../components/AnalysisStatusBadge";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { FeedItem, FeedListResponse } from "../../lib/feed";
import { NoteListItem, NoteListResponse } from "../../lib/notes";

type NotesTab = "notes" | "bookmarks";
type StatusFilter = "" | "pending" | "running" | "succeeded" | "failed";
type VisibilityFilter = "" | "private" | "public";
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

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
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[1080px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-2xl">学习笔记</CardTitle>
            <Button type="button" onClick={() => router.push("/notes/new")}>
              新建笔记
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={tab} onValueChange={(value) => void switchTab(value as NotesTab)}>
              <TabsList className="grid w-full max-w-[320px] grid-cols-2">
                <TabsTrigger value="notes">笔记</TabsTrigger>
                <TabsTrigger value="bookmarks">收藏</TabsTrigger>
              </TabsList>

              <TabsContent value="notes" className="space-y-4">
                <form className="grid gap-2 md:grid-cols-[1fr_180px_180px_auto]" onSubmit={onSearch}>
                  <Input
                    placeholder="按标题、链接、心得搜索"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <select className={SELECT_CLASS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                    <option value="">全部状态</option>
                    <option value="pending">待分析</option>
                    <option value="running">分析中</option>
                    <option value="succeeded">成功</option>
                    <option value="failed">失败</option>
                  </select>
                  <select
                    className={SELECT_CLASS}
                    value={visibilityFilter}
                    onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
                  >
                    <option value="">全部可见性</option>
                    <option value="private">私有</option>
                    <option value="public">公开</option>
                  </select>
                  <Button variant="secondary" type="submit">
                    查询
                  </Button>
                </form>

                {loading && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">加载中...</div>
                )}
                {!loading && notes.length === 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">暂无笔记</div>
                )}

                <div className="grid gap-3">
                  {notes.map((note) => (
                    <article key={note.id} className="space-y-3 rounded-lg border border-border bg-white p-4">
                      <div className="space-y-2">
                        <h3 className="text-base font-semibold text-foreground">{note.source_title || note.source_url}</h3>
                        <div className="text-sm text-muted-foreground">
                          {note.source_domain} · 发布时间 {formatPublishedAt(note)}
                        </div>
                        {!!note.tags.length && (
                          <div className="flex flex-wrap gap-1.5">
                            {note.tags.map((item) => (
                              <Badge key={`${note.id}-${item}`} variant="muted">
                                #{item}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {note.summary_excerpt && <p className="text-sm leading-6 text-muted-foreground">{note.summary_excerpt}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{note.bookmark_count} 收藏</Badge>
                        <Badge>{note.like_count} 点赞</Badge>
                        <AnalysisStatusBadge status={note.analysis_status} />
                        <Badge variant="secondary">{note.visibility === "public" ? "公开" : "私有"}</Badge>
                        <Button variant="secondary" size="sm" type="button" onClick={() => router.push(`/notes/${note.id}`)}>
                          查看
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="bookmarks" className="space-y-4">
                {loading && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">加载中...</div>
                )}
                {!loading && bookmarks.length === 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">暂无收藏</div>
                )}

                <div className="grid gap-3">
                  {bookmarks.map((item) => (
                    <article key={`${item.item_type}-${item.id}`} className="space-y-3 rounded-lg border border-border bg-white p-4">
                      <div className="space-y-2">
                        <h3 className="text-base font-semibold text-foreground">{item.source_title || item.source_url}</h3>
                        <div className="text-sm text-muted-foreground">
                          {item.creator_name} · {item.source_domain} · 发布时间 {formatPublishedAt(item)}
                        </div>
                        {!!item.tags.length && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.tags.map((tagItem) => (
                              <Badge key={`${item.id}-${tagItem}`} variant="muted">
                                #{tagItem}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {item.summary_excerpt && <p className="text-sm leading-6 text-muted-foreground">{item.summary_excerpt}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{item.bookmark_count} 收藏</Badge>
                        <Badge>{item.like_count} 点赞</Badge>
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          disabled={actingId === `bookmark:${item.item_type}:${item.id}`}
                          onClick={() => void onToggleBookmark(item)}
                        >
                          {item.bookmarked ? "取消收藏" : "收藏"}
                        </Button>
                        <Button size="sm" type="button" onClick={() => openBookmark(item)}>
                          查看
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
