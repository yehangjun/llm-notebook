"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AnalysisStatusBadge from "../../../../components/AnalysisStatusBadge";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { apiRequest } from "../../../../lib/api";
import { getStoredUser } from "../../../../lib/auth";
import { PublicNoteDetail } from "../../../../lib/notes";

const LONG_SUMMARY_CLAMP_CLASS =
  "overflow-hidden whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:10]";

export default function PublicNotePage() {
  const params = useParams<{ note_id: string }>();
  const router = useRouter();
  const noteId = params.note_id;

  const [note, setNote] = useState<PublicNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  async function fetchDetail() {
    setLoading(true);
    setError("");
    try {
      const uiLanguage = resolveUiLanguage();
      const data = await apiRequest<PublicNoteDetail>(
        `/notes/public/${noteId}?ui_language=${encodeURIComponent(uiLanguage)}`,
      );
      setNote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
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
              <CardTitle className="text-2xl">公开笔记</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "内容不存在或不可访问"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/feed")}>
                返回广场
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
            <CardTitle className="text-2xl">公开学习笔记</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/feed")}>
                广场
              </Button>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/notes")}>
                我的笔记
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <section className="space-y-3 rounded-lg border border-border bg-white p-4">
              <div className="text-base font-semibold text-foreground">{note.source_title || "未提取到标题"}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{note.source_domain}</span>
                {note.latest_summary?.published_at && (
                  <>
                    <span>·</span>
                    <span>{new Date(note.latest_summary.published_at).toLocaleString()}</span>
                  </>
                )}
                <span>·</span>
                <AnalysisStatusBadge status={note.analysis_status} />
              </div>
              <a className="block break-all text-sm text-primary underline-offset-4 hover:underline" href={note.source_url} target="_blank" rel="noreferrer">
                {note.source_url}
              </a>
              {!!note.tags.length && (
                <div className="flex flex-wrap gap-1.5">
                  {note.tags.map((item) => (
                    <Badge key={`${note.id}-${item}`} variant="muted">
                      #{item}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold text-foreground">AI 摘要</h2>
              {!note.latest_summary && <div className="text-sm text-muted-foreground">暂无摘要</div>}
              {note.latest_summary && note.latest_summary.status === "failed" && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {note.latest_summary.error_message || "分析失败"}
                </div>
              )}
              {note.latest_summary?.title && (
                <div className="text-sm text-foreground">{note.latest_summary.title}</div>
              )}
              {(note.latest_summary?.summary_long_text || note.latest_summary?.summary_text) && (
                <p className={LONG_SUMMARY_CLAMP_CLASS}>
                  {note.latest_summary?.summary_long_text || note.latest_summary?.summary_text}
                </p>
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
              创建于 {new Date(note.created_at).toLocaleString()} · 发布时间{" "}
              {new Date(note.latest_summary?.published_at ?? note.updated_at).toLocaleString()} · 分享链接：
              <Link className="ml-1 text-primary underline-offset-4 hover:underline" href={`/notes/public/${note.id}`}>
                /notes/public/{note.id}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function resolveUiLanguage(): string {
  const stored = getStoredUser();
  if (stored?.ui_language) {
    return stored.ui_language;
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "zh-CN";
}
