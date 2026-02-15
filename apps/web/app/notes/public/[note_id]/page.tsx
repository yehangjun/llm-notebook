"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiRequest } from "../../../../lib/api";
import { PublicNoteDetail } from "../../../../lib/notes";

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
      const data = await apiRequest<PublicNoteDetail>(`/notes/public/${noteId}`);
      setNote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

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
            <h1 style={{ marginTop: 0 }}>公开笔记</h1>
            <div className="error">{error || "内容不存在或不可访问"}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn secondary" type="button" onClick={() => router.push("/feed")}>
                返回广场
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
            <h1 style={{ margin: 0 }}>公开学习笔记</h1>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => router.push("/feed")}>
                广场
              </button>
              <button className="btn secondary" type="button" onClick={() => router.push("/notes")}>
                我的笔记
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
          </div>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ margin: "0 0 8px" }}>AI 摘要</h2>
            {!note.latest_summary && <div className="helper">暂无摘要</div>}
            {note.latest_summary && note.latest_summary.status === "failed" && (
              <div className="error">{note.latest_summary.error_message || "分析失败"}</div>
            )}
            {note.latest_summary?.title && (
              <div style={{ marginBottom: 8 }}>
                <strong>分析标题：</strong>
                {note.latest_summary.title}
              </div>
            )}
            {note.latest_summary?.summary_text && <p className="summary-block">{note.latest_summary.summary_text}</p>}
            {!!note.latest_summary?.tags?.length && (
              <div className="row" style={{ marginTop: 8 }}>
                {note.latest_summary.tags.map((item) => (
                  <span key={`${note.latest_summary?.id}-${item}`} className="pill">
                    #{item}
                  </span>
                ))}
              </div>
            )}
            {note.latest_summary && (
              <div className="helper" style={{ fontSize: 13 }}>
                模型：{note.latest_summary.model_provider || "-"} / {note.latest_summary.model_name || "-"} /{" "}
                {note.latest_summary.model_version || "-"} · {new Date(note.latest_summary.analyzed_at).toLocaleString()}
                {note.latest_summary.error_code ? ` · 错误码 ${note.latest_summary.error_code}` : ""}
              </div>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <h2 style={{ margin: "0 0 8px" }}>学习心得</h2>
            <pre className="note-preview">{note.note_body_md || "暂无学习心得"}</pre>
          </div>

          <div className="helper" style={{ marginTop: 12 }}>
            创建于 {new Date(note.created_at).toLocaleString()} · 更新于 {new Date(note.updated_at).toLocaleString()} ·
            分享链接：
            <Link href={`/notes/public/${note.id}`} style={{ marginLeft: 6 }}>
              /notes/public/{note.id}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function renderStatus(status: PublicNoteDetail["analysis_status"]): string {
  if (status === "pending") return "待分析";
  if (status === "running") return "分析中";
  if (status === "succeeded") return "成功";
  return "失败";
}
