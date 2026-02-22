"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AnalysisStatusBadge from "../../../../components/AnalysisStatusBadge";
import { Badge } from "../../../../components/ui/badge";
import { Button, buttonVariants } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { apiRequest } from "../../../../lib/api";
import { clearAuth, UserPublic } from "../../../../lib/auth";
import { NoteDetail } from "../../../../lib/notes";

type Visibility = "private" | "public";
const MAX_NOTE_TAGS = 5;
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";
const TEXTAREA_CLASS =
  "min-h-[220px] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function NoteWritePage() {
  const params = useParams<{ note_id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const noteId = params.note_id;
  const returnPath = resolveReturnPath(searchParams.get("return_to"), "/notes?tab=notes");
  const detailPath = `/notes/${noteId}?return_to=${encodeURIComponent(returnPath)}`;

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      setNoteBody(data.note_body_md);
      setVisibility(data.visibility);
      setTagInput(data.tags.join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest<NoteDetail>(
        `/notes/${noteId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            note_body_md: noteBody,
            visibility,
            tags: parseTags(tagInput),
          }),
        },
        true,
      );
      setNote(data);
      setTagInput(data.tags.join(", "));
      setSuccess("保存成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onReanalyze() {
    setReanalyzing(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest<NoteDetail>(`/notes/${noteId}/reanalyze`, { method: "POST" }, true);
      setNote(data);
      setSuccess("已触发重试分析");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    } finally {
      setReanalyzing(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("确认删除这条笔记吗？删除后不可恢复。")) {
      return;
    }
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<{ message: string }>(`/notes/${noteId}`, { method: "DELETE" }, true);
      router.push(returnPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const publicUrl = useMemo(() => {
    if (!note || note.visibility !== "public") return "";
    if (typeof window === "undefined") return `/notes/public/${note.id}`;
    return `${window.location.origin}/notes/public/${note.id}`;
  }, [note]);

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
              <CardTitle className="text-2xl">写作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "笔记不存在"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push(detailPath)}>
                返回详情
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
            <CardTitle className="text-2xl">写作</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push(detailPath)}>
                返回详情
              </Button>
              <Button variant="secondary" size="sm" type="button" onClick={onReanalyze} disabled={reanalyzing}>
                {reanalyzing ? "重试中..." : "重试分析"}
              </Button>
              <Button variant="destructive" size="sm" type="button" onClick={onDelete} disabled={deleting}>
                {deleting ? "删除中..." : "删除笔记"}
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
                <div className="flex items-center gap-2">
                  <span className="font-medium">状态：</span>
                  <AnalysisStatusBadge status={note.analysis_status} />
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

            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">AI 摘要（只读）</h2>
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

            <form className="space-y-4" onSubmit={onSave}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="visibility" className="text-sm font-medium text-foreground">
                    可见性
                  </label>
                  <select id="visibility" className={SELECT_CLASS} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                    <option value="private">私有</option>
                    <option value="public">公开</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="tags" className="text-sm font-medium text-foreground">
                    标签（可选）
                  </label>
                  <Input
                    id="tags"
                    placeholder="例如：#openai, #大模型"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                  />
                  <div className="text-xs text-muted-foreground">使用逗号或空格分隔，最多 5 个，支持中英文 hashtag（可带 # 前缀）。</div>
                </div>
              </div>

              {note.visibility === "public" && (
                <div className="text-sm text-muted-foreground">
                  公开链接：
                  <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href={`/notes/public/${note.id}`}>
                    {publicUrl || `/notes/public/${note.id}`}
                  </Link>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="note-body" className="text-sm font-medium text-foreground">
                  学习心得
                </label>
                <textarea id="note-body" className={TEXTAREA_CLASS} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
              </div>

              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
              <Button type="submit" disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function parseTags(input: string): string[] {
  const chunks = input
    .split(/[,\s，]+/)
    .map((item) => item.trim().replace(/^#+/, "").toLowerCase())
    .filter(Boolean);
  return [...new Set(chunks)].slice(0, MAX_NOTE_TAGS);
}

function resolveReturnPath(raw: string | null, fallbackPath: string): string {
  if (!raw) return fallbackPath;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallbackPath;
  return raw;
}
