"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AnalysisStatusBadge from "../../../../../components/AnalysisStatusBadge";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { apiRequest } from "../../../../../lib/api";
import { clearAuth, UserPublic } from "../../../../../lib/auth";
import { FeedDetailResponse } from "../../../../../lib/feed";

export default function FeedItemDetailPage() {
  const router = useRouter();
  const params = useParams<{ item_type: string; item_id: string }>();
  const itemType = params.item_type;
  const itemId = params.item_id;

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
              <CardTitle className="text-2xl">内容详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "内容不存在"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/feed")}>
                返回广场
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
            <CardTitle className="text-2xl">广场详情</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/feed")}>
                返回广场
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => window.open(item.source_url, "_blank", "noopener,noreferrer")}
              >
                原文链接
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">来源信息</h2>
              <div className="grid gap-2 text-sm text-foreground">
                <div>
                  <span className="font-medium">来源标题：</span>
                  {item.source_title || item.source_url}
                </div>
                <div>
                  <span className="font-medium">创作者：</span>
                  {item.creator_name}
                </div>
                <div>
                  <span className="font-medium">来源域名：</span>
                  {item.source_domain}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">状态：</span>
                  <AnalysisStatusBadge status={item.analysis_status} />
                </div>
                {item.published_at && (
                  <div>
                    <span className="font-medium">发布时间：</span>
                    {new Date(item.published_at).toLocaleString()}
                  </div>
                )}
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
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{item.bookmark_count} 收藏</Badge>
                <Badge>{item.like_count} 点赞</Badge>
                <Button variant="secondary" size="sm" type="button" onClick={() => void onToggleFollow()} disabled={acting === "follow"}>
                  {item.following ? "取消关注" : "关注"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => void onToggleBookmark()}
                  disabled={acting === "bookmark"}
                >
                  {item.bookmarked ? "取消收藏" : "收藏"}
                </Button>
                <Button variant="secondary" size="sm" type="button" onClick={() => void onToggleLike()} disabled={acting === "like"}>
                  {item.liked ? "取消点赞" : "点赞"}
                </Button>
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">AI 摘要</h2>
              {detail.summary_text ? (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6">{detail.summary_text}</p>
              ) : (
                <div className="text-sm text-muted-foreground">暂无摘要</div>
              )}
              {!!detail.key_points.length && (
                <ul className="ml-5 list-disc space-y-1 text-sm text-foreground">
                  {detail.key_points.map((point, idx) => (
                    <li key={`${item.id}-${idx}`}>{point}</li>
                  ))}
                </ul>
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
