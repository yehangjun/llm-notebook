"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import AnalysisStatusBadge from "../../components/AnalysisStatusBadge";
import CreatorProfileHoverCard from "../../components/CreatorProfileHoverCard";
import InteractionCountButton from "../../components/InteractionCountButton";
import { Badge, badgeVariants } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { FeedItem, FeedListResponse } from "../../lib/feed";
import { cn } from "../../lib/utils";
import { NoteListItem, NoteListResponse } from "../../lib/notes";

type NotesTab = "notes" | "bookmarks";
type StatusFilter = "" | "pending" | "running" | "succeeded" | "failed";
type VisibilityFilter = "" | "private" | "public";

const TITLE_CLAMP_CLASS =
  "overflow-hidden text-left text-base font-semibold text-foreground transition-colors hover:text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]";
const SUMMARY_CLAMP_CLASS =
  "overflow-hidden text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";

export default function NotesPage() {
  return (
    <Suspense fallback={<NotesPageFallback />}>
      <NotesPageContent />
    </Suspense>
  );
}

function NotesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<NotesTab>("notes");
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [bookmarks, setBookmarks] = useState<FeedItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");

  const fetchNotes = useCallback(async function fetchNotes({
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
  }, []);

  const fetchBookmarks = useCallback(async function fetchBookmarks() {
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
  }, []);

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true)
      .then((user) => {
        setCurrentUser(user);
        setAuthenticated(true);
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    const nextTab = parseNotesTab(searchParams.get("tab"));
    const nextStatus = parseStatusFilter(searchParams.get("status"));
    const nextVisibility = parseVisibilityFilter(searchParams.get("visibility"));
    const nextKeyword = (searchParams.get("keyword") || "").trim();
    const nextTag = normalizeTagFilter(searchParams.get("tag"));
    setTab(nextTab);
    setStatusFilter(nextStatus);
    setVisibilityFilter(nextVisibility);
    setKeyword(nextKeyword);
    setTagFilter(nextTag);
    if (nextTab === "bookmarks") {
      void fetchBookmarks();
      return;
    }
    void fetchNotes({
      status: nextStatus,
      visibility: nextVisibility,
      keyword: nextKeyword,
    });
  }, [authenticated, fetchBookmarks, fetchNotes, searchParams]);

  function switchTab(nextTab: NotesTab) {
    if (tab === nextTab) return;
    pushQuery(nextTab, statusFilter, visibilityFilter, keyword, tagFilter);
  }

  function onTagClick(tagValue: string) {
    const nextTag = normalizeTagFilter(tagValue);
    if (!nextTag) return;
    pushQuery(tab, statusFilter, visibilityFilter, keyword, nextTag === tagFilter ? "" : nextTag);
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

  async function onToggleLike(item: FeedItem) {
    setActingId(`like:${item.item_type}:${item.id}`);
    setError("");
    try {
      const method = item.liked ? "DELETE" : "POST";
      const path = item.item_type === "note" ? `/social/likes/notes/${item.id}` : `/social/likes/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchBookmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  async function onToggleFollow(item: FeedItem) {
    setActingId(`follow:${item.creator_kind}:${item.creator_id}`);
    setError("");
    try {
      const method = item.following ? "DELETE" : "POST";
      const path =
        item.creator_kind === "user"
          ? `/social/follows/users/${item.creator_id}`
          : `/social/follows/sources/${item.creator_id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchBookmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  function pushQuery(
    nextTab: NotesTab,
    nextStatus: StatusFilter,
    nextVisibility: VisibilityFilter,
    nextKeyword: string,
    nextTag: string,
  ) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    if (nextStatus) params.set("status", nextStatus);
    if (nextVisibility) params.set("visibility", nextVisibility);
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    const normalizedTag = normalizeTagFilter(nextTag);
    if (normalizedTag) params.set("tag", normalizedTag);
    router.replace(`/notes?${params.toString()}`);
  }

  function buildReturnToPath(nextTab: NotesTab): string {
    if (typeof window === "undefined") return `/notes?tab=${nextTab}`;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    return `/notes?${params.toString()}`;
  }

  function openNote(noteId: string) {
    const returnTo = buildReturnToPath("notes");
    router.push(`/notes/${noteId}?return_to=${encodeURIComponent(returnTo)}`);
  }

  function openBookmark(item: FeedItem) {
    const returnTo = buildReturnToPath("bookmarks");
    router.push(`/feed/items/${item.item_type}/${item.id}?return_to=${encodeURIComponent(returnTo)}`);
  }

  function formatPublishedAt(item: { published_at: string | null; updated_at: string }) {
    return new Date(item.published_at ?? item.updated_at).toLocaleString();
  }

  const visibleNotes = tagFilter
    ? notes.filter((note) => note.tags.some((item) => normalizeTagFilter(item) === tagFilter))
    : notes;

  const visibleBookmarks = tagFilter
    ? bookmarks.filter((item) => item.tags.some((tagItem) => normalizeTagFilter(tagItem) === tagFilter))
    : bookmarks;

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
                <TabsTrigger value="notes">我的</TabsTrigger>
                <TabsTrigger value="bookmarks">收藏</TabsTrigger>
              </TabsList>

              {!!tagFilter && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <span className="text-sm text-muted-foreground">标签筛选：</span>
                  <Badge variant="muted">#{tagFilter}</Badge>
                  <Button
                    className="ml-auto"
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => pushQuery(tab, statusFilter, visibilityFilter, keyword, "")}
                  >
                    清除标签
                  </Button>
                </div>
              )}

              <TabsContent value="notes" className="space-y-4">
                {!!keyword && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                    <span className="text-sm text-muted-foreground">关键词：</span>
                    <span className="text-sm font-medium text-foreground">{keyword}</span>
                    <Button
                      className="ml-auto"
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => pushQuery("notes", statusFilter, visibilityFilter, "", tagFilter)}
                    >
                      清除关键词
                    </Button>
                  </div>
                )}

                {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                {loading && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">加载中...</div>
                )}
                {!loading && visibleNotes.length === 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">暂无笔记</div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {visibleNotes.map((note) => (
                    <article key={note.id} className="flex h-full flex-col justify-between rounded-lg border border-border bg-white p-4">
                      <div className="space-y-3">
                        <button type="button" className={TITLE_CLAMP_CLASS} onClick={() => openNote(note.id)}>
                          {note.source_title || note.source_url}
                        </button>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          {currentUser ? (
                            <CreatorProfileHoverCard
                              creatorName={currentUser.nickname || currentUser.user_id}
                              creatorKind="user"
                              creatorId={currentUser.user_id}
                              sourceDomain={note.source_domain}
                              following={false}
                              onToggleFollow={async () => {}}
                            />
                          ) : (
                            <span>创作者</span>
                          )}
                          <span>·</span>
                          <span>{note.source_domain}</span>
                          <span>·</span>
                          <span>发布时间 {formatPublishedAt(note)}</span>
                        </div>
                        {!!note.tags.length && (
                          <div className="flex flex-wrap gap-1.5">
                            {note.tags.map((item) => (
                              <button
                                key={`${note.id}-${item}`}
                                type="button"
                                className={cn(
                                  badgeVariants({ variant: "muted" }),
                                  "cursor-pointer border transition-colors hover:border-border hover:bg-muted/80",
                                  normalizeTagFilter(item) === tagFilter && "border-border bg-muted/80 text-foreground",
                                )}
                                onClick={() => onTagClick(item)}
                              >
                                #{item}
                              </button>
                            ))}
                          </div>
                        )}
                        {!!note.auto_summary_excerpt?.trim() && (
                          <SummaryBlock variant="auto" content={note.auto_summary_excerpt} />
                        )}
                        {!!note.note_body_excerpt?.trim() && (
                          <SummaryBlock variant="note" content={note.note_body_excerpt} />
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <InteractionCountButton kind="bookmark" count={note.bookmark_count} active={false} />
                        <InteractionCountButton kind="like" count={note.like_count} active={false} />
                        <AnalysisStatusBadge status={note.analysis_status} />
                        <Badge variant="secondary">{note.visibility === "public" ? "公开" : "私有"}</Badge>
                        <Badge variant="secondary" className="ml-auto">
                          笔记
                        </Badge>
                      </div>
                    </article>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="bookmarks" className="space-y-4">
                {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                {loading && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">加载中...</div>
                )}
                {!loading && visibleBookmarks.length === 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">暂无收藏</div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {visibleBookmarks.map((item) => (
                    <article
                      key={`${item.item_type}-${item.id}`}
                      className="flex h-full flex-col justify-between rounded-lg border border-border bg-white p-4"
                    >
                      <div className="space-y-3">
                        <button type="button" className={TITLE_CLAMP_CLASS} onClick={() => openBookmark(item)}>
                          {item.source_title || item.source_url}
                        </button>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <CreatorProfileHoverCard
                            creatorName={item.creator_name}
                            creatorKind={item.creator_kind}
                            creatorId={item.creator_id}
                            sourceDomain={item.source_domain}
                            following={item.following}
                            disabled={actingId === `follow:${item.creator_kind}:${item.creator_id}`}
                            onToggleFollow={() => onToggleFollow(item)}
                          />
                          <span>·</span>
                          <span>{item.source_domain}</span>
                          <span>·</span>
                          <span>发布时间 {formatPublishedAt(item)}</span>
                        </div>
                        {!!item.tags.length && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.tags.map((tagItem) => (
                              <button
                                key={`${item.item_type}-${item.id}-${tagItem}`}
                                type="button"
                                className={cn(
                                  badgeVariants({ variant: "muted" }),
                                  "cursor-pointer border transition-colors hover:border-border hover:bg-muted/80",
                                  normalizeTagFilter(tagItem) === tagFilter && "border-border bg-muted/80 text-foreground",
                                )}
                                onClick={() => onTagClick(tagItem)}
                              >
                                #{tagItem}
                              </button>
                            ))}
                          </div>
                        )}
                        {!!item.auto_summary_excerpt?.trim() && (
                          <SummaryBlock variant="auto" content={item.auto_summary_excerpt} />
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <InteractionCountButton
                          kind="bookmark"
                          count={item.bookmark_count}
                          active={item.bookmarked}
                          disabled={actingId === `bookmark:${item.item_type}:${item.id}`}
                          onClick={() => void onToggleBookmark(item)}
                        />
                        <InteractionCountButton
                          kind="like"
                          count={item.like_count}
                          active={item.liked}
                          disabled={actingId === `like:${item.item_type}:${item.id}`}
                          onClick={() => void onToggleLike(item)}
                        />
                        <Badge variant="secondary" className="ml-auto">
                          {item.item_type === "aggregate" ? "聚合" : "笔记"}
                        </Badge>
                      </div>
                    </article>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function NotesPageFallback() {
  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[1080px]">
        <Card>
          <CardContent className="py-10">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">加载中...</div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SummaryBlock({
  variant,
  content,
}: {
  variant: "auto" | "note";
  content: string;
}) {
  const blockClass =
    variant === "auto"
      ? "rounded-md border border-sky-100 bg-sky-50/70 p-2.5"
      : "rounded-md border border-emerald-100 bg-emerald-50/70 p-2.5";
  return (
    <div className={blockClass}>
      <p className={SUMMARY_CLAMP_CLASS}>{content}</p>
    </div>
  );
}

function parseNotesTab(raw: string | null): NotesTab {
  if (raw === "bookmarks") return "bookmarks";
  return "notes";
}

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === "pending") return "pending";
  if (raw === "running") return "running";
  if (raw === "succeeded") return "succeeded";
  if (raw === "failed") return "failed";
  return "";
}

function parseVisibilityFilter(raw: string | null): VisibilityFilter {
  if (raw === "private") return "private";
  if (raw === "public") return "public";
  return "";
}

function normalizeTagFilter(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^#+/, "").toLowerCase();
}
