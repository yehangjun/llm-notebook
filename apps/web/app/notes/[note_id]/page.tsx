"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../../lib/api";
import { clearAuth, UserPublic } from "../../../lib/auth";
import { NoteDetail } from "../../../lib/notes";

type Visibility = "private" | "public";

export default function NoteDetailPage() {
  const params = useParams<{ note_id: string }>();
  const router = useRouter();
  const noteId = params.note_id;

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

  async function fetchDetail() {
    setLoading(true);
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
      setLoading(false);
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
      setSuccess("已完成重试分析");
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
      router.push("/notes");
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
      <main className="page">
        <div className="container">
          <section className="card">加载中...</section>
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="page">
        <div className="container">
          <section className="card">
            <h1 style={{ marginTop: 0 }}>笔记详情</h1>
            <div className="error">{error || "笔记不存在"}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn secondary" type="button" onClick={() => router.push("/notes")}>
                返回列表
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 900 }}>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>学习笔记详情</h1>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => router.push("/notes")}>
                返回列表
              </button>
              <button className="btn secondary" type="button" onClick={onReanalyze} disabled={reanalyzing}>
                {reanalyzing ? "重试中..." : "重试分析"}
              </button>
              <button className="btn secondary" type="button" onClick={onDelete} disabled={deleting}>
                {deleting ? "删除中..." : "删除笔记"}
              </button>
            </div>
          </div>

          <div className="note-meta" style={{ marginTop: 14 }}>
            <div>
              <strong>来源标题：</strong>
              {note.source_title || "未提取到标题"}
            </div>
            <div>
              <strong>来源链接：</strong>
              <a href={note.source_url} target="_blank" rel="noreferrer">
                {note.source_url}
              </a>
            </div>
            <div>
              <strong>状态：</strong>
              <span className={`pill status-${note.analysis_status}`}>{renderStatus(note.analysis_status)}</span>
            </div>
            {!!note.tags.length && (
              <div className="row">
                {note.tags.map((item) => (
                  <span key={`${note.id}-${item}`} className="pill">
                    #{item}
                  </span>
                ))}
              </div>
            )}
            {note.analysis_error && <div className="error">{note.analysis_error}</div>}
          </div>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ margin: "0 0 8px" }}>AI 摘要（只读）</h2>
            {!note.latest_summary && <div className="helper">暂无摘要</div>}
            {note.latest_summary && note.latest_summary.status === "failed" && (
              <div className="error">{note.latest_summary.error_message || "分析失败"}</div>
            )}
            {note.latest_summary?.summary_text && <p className="summary-block">{note.latest_summary.summary_text}</p>}
            {!!note.latest_summary?.key_points?.length && (
              <ul className="summary-points">
                {note.latest_summary.key_points.map((point, idx) => (
                  <li key={`${note.latest_summary?.id}-${idx}`}>{point}</li>
                ))}
              </ul>
            )}
            {note.latest_summary && (
              <div className="helper" style={{ fontSize: 13 }}>
                模型：{note.latest_summary.model_provider || "-"} / {note.latest_summary.model_name || "-"} /{" "}
                {note.latest_summary.model_version || "-"} · {new Date(note.latest_summary.analyzed_at).toLocaleString()}
              </div>
            )}
          </div>

          <form className="form-stack" onSubmit={onSave} style={{ marginTop: 16 }}>
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
            </div>
            {note.visibility === "public" && (
              <div className="helper">
                公开链接：
                <Link href={`/notes/public/${note.id}`} style={{ marginLeft: 6 }}>
                  {publicUrl || `/notes/public/${note.id}`}
                </Link>
              </div>
            )}
            <div className="field">
              <label htmlFor="note-body">学习心得</label>
              <textarea
                id="note-body"
                className="note-textarea"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
            </div>
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function renderStatus(status: NoteDetail["analysis_status"]): string {
  if (status === "pending") return "待分析";
  if (status === "running") return "分析中";
  if (status === "succeeded") return "成功";
  return "失败";
}

function parseTags(input: string): string[] {
  const chunks = input
    .split(/[,\s，]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(chunks)];
}
