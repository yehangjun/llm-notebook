"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiRequest } from "../../../../lib/api";
import { PublicNoteDetail } from "../../../../lib/notes";

export default function PublicNotePage() {
  const params = useParams<{ note_id: string }>();
  const noteId = params.note_id;
  const [note, setNote] = useState<PublicNoteDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<PublicNoteDetail>(`/notes/public/${noteId}`)
      .then((data) => setNote(data))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [noteId]);

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
            <h1 style={{ marginTop: 0 }}>公开学习笔记</h1>
            <div className="error">{error || "该笔记不存在或未公开"}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <Link href="/" className="btn secondary">
                返回首页
              </Link>
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
          <h1 style={{ marginTop: 0 }}>{note.source_title || "公开学习笔记"}</h1>
          <div className="note-meta">
            <div>
              <strong>来源链接：</strong>
              <a href={note.source_url} target="_blank" rel="noreferrer">
                {note.source_url}
              </a>
            </div>
            <div>
              <strong>分析状态：</strong>
              {note.analysis_status === "succeeded" ? "成功" : note.analysis_status}
            </div>
            <div className="helper">更新于 {new Date(note.updated_at).toLocaleString()}</div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ margin: "0 0 8px" }}>AI 摘要</h2>
            {note.latest_summary?.summary_text ? (
              <p className="summary-block">{note.latest_summary.summary_text}</p>
            ) : (
              <div className="helper">暂无可展示摘要</div>
            )}
            {!!note.latest_summary?.key_points?.length && (
              <ul className="summary-points">
                {note.latest_summary.key_points.map((point, idx) => (
                  <li key={`${note.latest_summary?.id}-${idx}`}>{point}</li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ margin: "0 0 8px" }}>学习心得</h2>
            <pre className="note-preview">{note.note_body_md || "暂无学习心得"}</pre>
          </div>
        </section>
      </div>
    </main>
  );
}
