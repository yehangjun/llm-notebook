"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { apiRequest } from "../../../lib/api";
import { clearAuth, UserPublic } from "../../../lib/auth";
import { CreateNoteResponse } from "../../../lib/notes";

type Visibility = "private" | "public";
const MAX_NOTE_TAGS = 5;
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";
const TEXTAREA_CLASS =
  "min-h-[220px] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function NewNotePage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true).catch(() => {
      clearAuth();
      router.push("/auth");
    });
  }, [router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest<CreateNoteResponse>(
        "/notes",
        {
          method: "POST",
          body: JSON.stringify({
            source_url: sourceUrl,
            visibility,
            note_body_md: noteBody,
            tags: parseTags(tagInput),
          }),
        },
        true,
      );
      router.push(`/notes/${data.note.id}?return_to=${encodeURIComponent("/notes?tab=notes")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[860px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-2xl">新建学习笔记</CardTitle>
            <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/notes")}>
              返回列表
            </Button>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label htmlFor="source-url" className="text-sm font-medium text-foreground">
                  外部链接
                </label>
                <Input
                  id="source-url"
                  placeholder="https://example.com/article"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                />
                <div className="text-xs text-muted-foreground">支持所有网站链接；微信公众号和 YouTube 链接会自动归一化并去重。</div>
              </div>
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
              <div className="space-y-2">
                <label htmlFor="note-body" className="text-sm font-medium text-foreground">
                  学习心得（可选）
                </label>
                <textarea
                  id="note-body"
                  className={TEXTAREA_CLASS}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="你可以先写下学习目标或初步心得，后续可继续编辑"
                />
              </div>
              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <Button type="submit" disabled={loading}>
                {loading ? "创建中..." : "创建并分析"}
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
