"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import CreatorProfileHoverCard from "../../components/CreatorProfileHoverCard";
import InteractionCountButton from "../../components/InteractionCountButton";
import { Badge, badgeVariants } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { FeedItem, FeedListResponse } from "../../lib/feed";
import { cn } from "../../lib/utils";

type FeedScope = "following" | "unfollowed";

const TITLE_CLAMP_CLASS =
  "overflow-hidden text-left text-base font-semibold text-foreground transition-colors hover:text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]";
const SUMMARY_CLAMP_CLASS =
  "overflow-hidden text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedPageFallback />}>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scope, setScope] = useState<FeedScope>("following");
  const [tag, setTag] = useState("");
  const [keyword, setKeyword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");

  const fetchFeed = useCallback(async function fetchFeed({
    nextScope,
    nextTag,
    nextKeyword,
  }: {
    nextScope: FeedScope;
    nextTag: string;
    nextKeyword: string;
  }) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("scope", nextScope);
      if (nextTag.trim()) params.set("tag", nextTag.trim().toLowerCase());
      if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
      const path = `/feed?${params.toString()}`;
      const data = await apiRequest<FeedListResponse>(path, {}, true);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载信息流失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true)
      .then(() => {
        setAuthenticated(true);
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    const nextScope = parseScope(searchParams.get("scope"));
    const nextTag = normalizeTagFilter(searchParams.get("tag"));
    const nextKeyword = (searchParams.get("keyword") || "").trim();
    setScope(nextScope);
    setTag(nextTag);
    setKeyword(nextKeyword);
    void fetchFeed({
      nextScope,
      nextTag,
      nextKeyword,
    });
  }, [authenticated, fetchFeed, searchParams]);

  function pushQuery(nextScope: FeedScope, nextTag: string, nextKeyword: string) {
    const params = new URLSearchParams();
    params.set("scope", nextScope);
    const normalizedTag = normalizeTagFilter(nextTag);
    if (normalizedTag) params.set("tag", normalizedTag);
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    router.replace(`/feed?${params.toString()}`);
  }

  function onTagClick(tagValue: string) {
    const nextTag = normalizeTagFilter(tagValue);
    if (!nextTag) return;
    pushQuery(scope, nextTag === tag ? "" : nextTag, keyword);
  }

  function switchScope(nextScope: FeedScope) {
    if (scope === nextScope) return;
    pushQuery(nextScope, tag, keyword);
  }

  async function onToggleLike(item: FeedItem) {
    setActingId(`like:${item.item_type}:${item.id}`);
    setError("");
    try {
      const method = item.liked ? "DELETE" : "POST";
      const path = item.item_type === "note" ? `/social/likes/notes/${item.id}` : `/social/likes/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
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
      await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
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
      await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  function buildReturnToPath() {
    if (typeof window === "undefined") {
      return `/feed?scope=${scope}`;
    }
    return `${window.location.pathname}${window.location.search}`;
  }

  function openDetail(item: FeedItem) {
    const returnTo = buildReturnToPath();
    router.push(`/feed/items/${item.item_type}/${item.id}?return_to=${encodeURIComponent(returnTo)}`);
  }

  function formatPublishedAt(item: FeedItem) {
    return new Date(item.published_at ?? item.updated_at).toLocaleString();
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[1080px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-2xl">广场信息流</CardTitle>
            <Button variant="secondary" type="button" onClick={() => router.push("/notes")}>
              我的笔记
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={scope} onValueChange={(value) => void switchScope(value as FeedScope)}>
              <TabsList className="grid w-full max-w-[320px] grid-cols-2">
                <TabsTrigger value="following">已关注</TabsTrigger>
                <TabsTrigger value="unfollowed">未关注</TabsTrigger>
              </TabsList>
            </Tabs>

            {!!keyword && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">关键词：</span>
                <span className="text-sm font-medium text-foreground">{keyword}</span>
                <Button
                  className="ml-auto"
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => pushQuery(scope, tag, "")}
                >
                  清除关键词
                </Button>
              </div>
            )}

            {!!tag && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">标签筛选：</span>
                <Badge variant="muted">#{tag}</Badge>
                <Button className="ml-auto" variant="ghost" size="sm" type="button" onClick={() => pushQuery(scope, "", keyword)}>
                  清除标签
                </Button>
              </div>
            )}

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {loading && <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">加载中...</div>}
            {!loading && items.length === 0 && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">当前没有内容</div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <article
                  key={`${item.item_type}-${item.id}`}
                  className="flex h-full flex-col justify-between rounded-lg border border-border bg-white p-4"
                >
                  <div className="space-y-3">
                    <button type="button" className={TITLE_CLAMP_CLASS} onClick={() => openDetail(item)}>
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
                              normalizeTagFilter(tagItem) === tag && "border-border bg-muted/80 text-foreground",
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
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function FeedPageFallback() {
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

function parseScope(raw: string | null): FeedScope {
  if (raw === "unfollowed") return "unfollowed";
  return "following";
}

function normalizeTagFilter(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^#+/, "").toLowerCase();
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
