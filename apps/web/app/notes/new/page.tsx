"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../../lib/api";
import { clearAuth, UserPublic } from "../../../lib/auth";
import { CreateNoteResponse } from "../../../lib/notes";

type Visibility = "private" | "public";

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
      router.push(`/notes/${data.note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 760 }}>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>新建学习笔记</h1>
            <button className="btn secondary" type="button" onClick={() => router.push("/notes")}>
              返回列表
            </button>
          </div>

          <form className="form-stack" onSubmit={onSubmit} style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="source-url">外部链接</label>
              <input
                id="source-url"
                placeholder="https://example.com/article"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                required
              />
              <div className="helper" style={{ marginTop: 6 }}>
                支持所有网站链接；微信公众号和 YouTube 链接会自动归一化并去重。
              </div>
            </div>
            <div className="field">
              <label htmlFor="visibility">可见性</label>
              <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                <option value="private">私有</option>
                <option value="public">公开</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="tags">标签（可选）</label>
              <input
                id="tags"
                placeholder="例如：openai,agent,rag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <div className="helper" style={{ marginTop: 6 }}>
                使用英文逗号或空格分隔，支持小写字母/数字/下划线/中划线。
              </div>
            </div>
            <div className="field">
              <label htmlFor="note-body">学习心得（可选）</label>
              <textarea
                id="note-body"
                className="note-textarea"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="你可以先写下学习目标或初步心得，后续可继续编辑"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "创建中..." : "创建并分析"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function parseTags(input: string): string[] {
  const chunks = input
    .split(/[,\s，]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(chunks)];
}
