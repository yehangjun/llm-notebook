"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import CreatorProfileHoverCard from "../../components/CreatorProfileHoverCard";
import InteractionCountButton from "../../components/InteractionCountButton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { FeedItem, FeedListResponse } from "../../lib/feed";

type FeedScope = "following" | "unfollowed";

const TITLE_CLAMP_CLASS =
  "overflow-hidden text-left text-base font-semibold text-foreground transition-colors hover:text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]";
const SUMMARY_CLAMP_CLASS =
  "overflow-hidden text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";

export default function FeedPage() {
  const router = useRouter();
  const [scope, setScope] = useState<FeedScope>("following");
  const [tag, setTag] = useState("");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const nextScope = parseScope(query.get("scope"));
    const nextTag = (query.get("tag") || "").trim();
    const nextKeyword = (query.get("keyword") || "").trim();

    apiRequest<UserPublic>("/me", {}, true)
      .then(async () => {
        setScope(nextScope);
        setTag(nextTag);
        setKeyword(nextKeyword);
        await fetchFeed({
          nextScope,
          nextTag,
          nextKeyword,
        });
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchFeed({
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
  }

  function pushQuery(nextScope: FeedScope, nextTag: string, nextKeyword: string) {
    const params = new URLSearchParams();
    params.set("scope", nextScope);
    if (nextTag.trim()) params.set("tag", nextTag.trim().toLowerCase());
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    router.replace(`/feed?${params.toString()}`);
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
    pushQuery(scope, tag, keyword);
  }

  async function switchScope(nextScope: FeedScope) {
    if (scope === nextScope) return;
    setScope(nextScope);
    await fetchFeed({ nextScope, nextTag: tag, nextKeyword: keyword });
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

            <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={onSearch}>
              <Input
                placeholder="关键词（标题/链接/创作者/摘要）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Input
                placeholder="按标签筛选（例如：#openai 或 #大模型）"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <Button variant="secondary" type="submit">
                筛选
              </Button>
            </form>

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
                          <Badge key={`${item.item_type}-${item.id}-${tagItem}`} variant="muted">
                            #{tagItem}
                          </Badge>
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

function parseScope(raw: string | null): FeedScope {
  if (raw === "unfollowed") return "unfollowed";
  return "following";
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
