"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import AnalysisStatusBadge from "../../../../../components/AnalysisStatusBadge";
import CreatorProfileHoverCard from "../../../../../components/CreatorProfileHoverCard";
import InteractionCountButton from "../../../../../components/InteractionCountButton";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { apiRequest } from "../../../../../lib/api";
import { clearAuth, UserPublic } from "../../../../../lib/auth";
import { FeedDetailResponse } from "../../../../../lib/feed";

const LONG_SUMMARY_CLAMP_CLASS =
  "overflow-hidden whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:10]";

export default function FeedItemDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ item_type: string; item_id: string }>();
  const itemType = params.item_type;
  const itemId = params.item_id;
  const returnPath = resolveReturnPath(searchParams.get("return_to"), "/feed?scope=following");

  const [detail, setDetail] = useState<FeedDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true)
      .then(() => fetchDetail())
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, itemType, itemId]);

  async function fetchDetail() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<FeedDetailResponse>(`/feed/items/${itemType}/${itemId}`, {}, true);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function onToggleFollow() {
    if (!detail) return;
    const item = detail.item;
    setActing("follow");
    setError("");
    try {
      const method = item.following ? "DELETE" : "POST";
      const path =
        item.creator_kind === "user"
          ? `/social/follows/users/${item.creator_id}`
          : `/social/follows/sources/${item.creator_id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing("");
    }
  }

  async function onToggleLike() {
    if (!detail) return;
    const item = detail.item;
    setActing("like");
    setError("");
    try {
      const method = item.liked ? "DELETE" : "POST";
      const path =
        item.item_type === "note" ? `/social/likes/notes/${item.id}` : `/social/likes/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing("");
    }
  }

  async function onToggleBookmark() {
    if (!detail) return;
    const item = detail.item;
    setActing("bookmark");
    setError("");
    try {
      const method = item.bookmarked ? "DELETE" : "POST";
      const path =
        item.item_type === "note"
          ? `/social/bookmarks/notes/${item.id}`
          : `/social/bookmarks/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing("");
    }
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[980px]">
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[980px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "内容不存在"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push(returnPath)}>
                返回
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const item = detail.item;
  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[980px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">详情</CardTitle>
              <Badge variant="secondary">{item.item_type === "aggregate" ? "聚合" : "笔记"}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push(returnPath)}>
                返回
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3 rounded-lg border border-border bg-white p-4">
              <div className="text-base font-semibold text-foreground">{item.source_title || item.source_url}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <CreatorProfileHoverCard
                  className="align-middle"
                  creatorName={item.creator_name}
                  creatorKind={item.creator_kind}
                  creatorId={item.creator_id}
                  sourceDomain={item.source_domain}
                  following={item.following}
                  disabled={acting === "follow"}
                  onToggleFollow={onToggleFollow}
                />
                <span>·</span>
                <span>{item.source_domain}</span>
                {item.published_at && (
                  <>
                    <span>·</span>
                    <span>{new Date(item.published_at).toLocaleString()}</span>
                  </>
                )}
                <span>·</span>
                <AnalysisStatusBadge status={item.analysis_status} />
              </div>
              <a className="block break-all text-sm text-primary underline-offset-4 hover:underline" href={item.source_url} target="_blank" rel="noreferrer">
                {item.source_url}
              </a>
              {!!item.tags.length && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tagItem) => (
                    <Badge key={`${item.id}-${tagItem}`} variant="muted">
                      #{tagItem}
                    </Badge>
                  ))}
                </div>
              )}
              {detail.analysis_error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{detail.analysis_error}</div>}
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <InteractionCountButton
                  kind="bookmark"
                  count={item.bookmark_count}
                  active={item.bookmarked}
                  disabled={acting === "bookmark"}
                  onClick={() => void onToggleBookmark()}
                />
                <InteractionCountButton
                  kind="like"
                  count={item.like_count}
                  active={item.liked}
                  disabled={acting === "like"}
                  onClick={() => void onToggleLike()}
                />
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">AI 摘要</h2>
              {(detail.summary_long_text || detail.summary_text) ? (
                <p className={LONG_SUMMARY_CLAMP_CLASS}>{detail.summary_long_text || detail.summary_text}</p>
              ) : (
                <div className="text-sm text-muted-foreground">暂无摘要</div>
              )}
              {(detail.model_provider || detail.model_name || detail.model_version || detail.analyzed_at) && (
                <div className="text-xs text-muted-foreground">
                  模型：{detail.model_provider || "-"} / {detail.model_name || "-"} / {detail.model_version || "-"} ·
                  {detail.analyzed_at ? ` ${new Date(detail.analyzed_at).toLocaleString()}` : " -"}
                </div>
              )}
            </section>

            {detail.note_body_md !== null && (
              <section className="space-y-2 rounded-lg border border-border bg-white p-4">
                <h2 className="text-base font-semibold text-foreground">学习心得</h2>
                <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {detail.note_body_md || "暂无学习心得"}
                </pre>
              </section>
            )}
            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function resolveReturnPath(raw: string | null, fallbackPath: string): string {
  if (!raw) return fallbackPath;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallbackPath;
  return raw;
}
