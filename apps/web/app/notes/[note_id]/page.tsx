"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AnalysisStatusBadge from "../../../components/AnalysisStatusBadge";
import CreatorProfileHoverCard from "../../../components/CreatorProfileHoverCard";
import InteractionCountButton from "../../../components/InteractionCountButton";
import { Badge } from "../../../components/ui/badge";
import { Button, buttonVariants } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { apiRequest } from "../../../lib/api";
import { clearAuth, UserPublic } from "../../../lib/auth";
import { FeedDetailResponse } from "../../../lib/feed";
import { NoteDetail } from "../../../lib/notes";

export default function NoteDetailPage() {
  const params = useParams<{ note_id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const noteId = params.note_id;
  const returnPath = resolveReturnPath(searchParams.get("return_to"), "/notes?tab=notes");

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [socialItem, setSocialItem] = useState<FeedDetailResponse["item"] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true)
      .then(() => fetchDetail())
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, noteId]);

  useEffect(() => {
    if (!note || !["pending", "running"].includes(note.analysis_status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void fetchDetail({ silent: true });
    }, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.analysis_status, noteId]);

  async function fetchDetail({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) {
      setLoading(true);
    }
    setError("");
    try {
      const data = await apiRequest<NoteDetail>(`/notes/${noteId}`, {}, true);
      setNote(data);
      if (data.visibility !== "public") {
        setSocialItem(null);
        return;
      }
      try {
        const social = await apiRequest<FeedDetailResponse>(`/feed/items/note/${noteId}`, {}, true);
        setSocialItem(social.item);
      } catch {
        setSocialItem(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  const publicUrl = useMemo(() => {
    if (!note || note.visibility !== "public") return "";
    if (typeof window === "undefined") return `/notes/public/${note.id}`;
    return `${window.location.origin}/notes/public/${note.id}`;
  }, [note]);

  const writePath = useMemo(() => {
    return `/notes/${noteId}/write?return_to=${encodeURIComponent(returnPath)}`;
  }, [noteId, returnPath]);

  async function onToggleFollow() {
    if (!socialItem) return;
    setActing("follow");
    setError("");
    try {
      const method = socialItem.following ? "DELETE" : "POST";
      const path =
        socialItem.creator_kind === "user"
          ? `/social/follows/users/${socialItem.creator_id}`
          : `/social/follows/sources/${socialItem.creator_id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchDetail({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing("");
    }
  }

  async function onToggleBookmark() {
    if (!socialItem) return;
    setActing("bookmark");
    setError("");
    try {
      const method = socialItem.bookmarked ? "DELETE" : "POST";
      await apiRequest<{ message: string }>(`/social/bookmarks/notes/${socialItem.id}`, { method }, true);
      await fetchDetail({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing("");
    }
  }

  async function onToggleLike() {
    if (!socialItem) return;
    setActing("like");
    setError("");
    try {
      const method = socialItem.liked ? "DELETE" : "POST";
      await apiRequest<{ message: string }>(`/social/likes/notes/${socialItem.id}`, { method }, true);
      await fetchDetail({ silent: true });
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

  if (!note) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[980px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "笔记不存在"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push(returnPath)}>
                返回
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[980px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">详情</CardTitle>
              <Badge variant="secondary">笔记</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push(returnPath)}>
                返回
              </Button>
              <Button size="sm" type="button" onClick={() => router.push(writePath)}>
                写作
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">来源信息</h2>
              <div className="grid gap-2 text-sm text-foreground">
                <div>
                  <span className="font-medium">来源标题：</span>
                  {note.source_title || "未提取到标题"}
                </div>
                <div className="break-all">
                  <span className="font-medium">来源链接：</span>
                  <a className="text-primary underline-offset-4 hover:underline" href={note.source_url} target="_blank" rel="noreferrer">
                    {note.source_url}
                  </a>
                </div>
                <div>
                  <span className="font-medium">来源域名：</span>
                  {note.source_domain}
                </div>
                <div>
                  <span className="font-medium">创作者：</span>
                  {socialItem ? (
                    <CreatorProfileHoverCard
                      className="align-middle"
                      creatorName={socialItem.creator_name}
                      creatorKind={socialItem.creator_kind}
                      creatorId={socialItem.creator_id}
                      sourceDomain={socialItem.source_domain}
                      following={socialItem.following}
                      disabled={acting === "follow"}
                      onToggleFollow={onToggleFollow}
                    />
                  ) : (
                    <span className="text-muted-foreground">本人</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">状态：</span>
                  <AnalysisStatusBadge status={note.analysis_status} />
                  <Badge variant="secondary">{note.visibility === "public" ? "公开" : "私有"}</Badge>
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
                {note.analysis_error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{note.analysis_error}</div>
                )}
              </div>
            </section>

            {socialItem && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <InteractionCountButton
                    kind="bookmark"
                    count={socialItem.bookmark_count}
                    active={socialItem.bookmarked}
                    disabled={acting === "bookmark"}
                    onClick={() => void onToggleBookmark()}
                  />
                  <InteractionCountButton
                    kind="like"
                    count={socialItem.like_count}
                    active={socialItem.liked}
                    disabled={acting === "like"}
                    onClick={() => void onToggleLike()}
                  />
                </div>
              </section>
            )}

            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">AI 摘要</h2>
              {!note.latest_summary && <div className="text-sm text-muted-foreground">暂无摘要</div>}
              {note.latest_summary && note.latest_summary.status === "failed" && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {note.latest_summary.error_message || "分析失败"}
                </div>
              )}
              {note.latest_summary?.title && (
                <div className="text-sm">
                  <span className="font-medium">分析标题：</span>
                  {note.latest_summary.title}
                </div>
              )}
              {note.latest_summary?.published_at && (
                <div className="text-sm">
                  <span className="font-medium">发布时间：</span>
                  {new Date(note.latest_summary.published_at).toLocaleString()}
                </div>
              )}
              {note.latest_summary?.summary_text && (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6">{note.latest_summary.summary_text}</p>
              )}
              {!!note.latest_summary?.tags?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {note.latest_summary.tags.map((item) => (
                    <Badge key={`${note.latest_summary?.id}-${item}`} variant="muted">
                      #{item}
                    </Badge>
                  ))}
                </div>
              )}
              {note.latest_summary && (
                <div className="text-xs text-muted-foreground">
                  模型：{note.latest_summary.model_provider || "-"} / {note.latest_summary.model_name || "-"} /{" "}
                  {note.latest_summary.model_version || "-"} · {new Date(note.latest_summary.analyzed_at).toLocaleString()}
                  {note.latest_summary.error_code ? ` · 错误码 ${note.latest_summary.error_code}` : ""}
                </div>
              )}
            </section>

            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">学习心得</h2>
              <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {note.note_body_md || "暂无学习心得"}
              </pre>
            </section>

            <div className="text-xs text-muted-foreground">
              创建于 {new Date(note.created_at).toLocaleString()} · 更新时间 {new Date(note.updated_at).toLocaleString()} · 公开链接：
              {note.visibility === "public" ? (
                <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href={`/notes/public/${note.id}`}>
                  {publicUrl || `/notes/public/${note.id}`}
                </Link>
              ) : (
                <span className="ml-1">未公开</span>
              )}
            </div>
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
