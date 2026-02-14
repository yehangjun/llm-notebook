"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
      <main className="page">
        <div className="container">
          <section className="card">加载中...</section>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="page">
        <div className="container">
          <section className="card">
            <h1 style={{ marginTop: 0 }}>内容详情</h1>
            <div className="error">{error || "内容不存在"}</div>
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

  const item = detail.item;
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 920 }}>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>广场详情</h1>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => router.push("/feed")}>
                返回广场
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => window.open(item.source_url, "_blank", "noopener,noreferrer")}
              >
                原文链接
              </button>
            </div>
          </div>

          <div className="note-meta" style={{ marginTop: 14 }}>
            <div>
              <strong>来源标题：</strong>
              {item.source_title || item.source_url}
            </div>
            <div>
              <strong>创作者：</strong>
              {item.creator_name}
            </div>
            <div>
              <strong>来源域名：</strong>
              {item.source_domain}
            </div>
            <div>
              <strong>状态：</strong>
              <span className={`pill status-${item.analysis_status}`}>{renderStatus(item.analysis_status)}</span>
            </div>
            {!!item.tags.length && (
              <div className="row">
                {item.tags.map((tagItem) => (
                  <span key={`${item.id}-${tagItem}`} className="pill">
                    #{tagItem}
                  </span>
                ))}
              </div>
            )}
            {detail.analysis_error && <div className="error">{detail.analysis_error}</div>}
          </div>

          <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
            <span className="pill">{item.bookmark_count} 收藏</span>
            <span className="pill">{item.like_count} 点赞</span>
            <button className="btn secondary" type="button" onClick={() => void onToggleFollow()} disabled={acting === "follow"}>
              {item.following ? "取消关注" : "关注"}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => void onToggleBookmark()}
              disabled={acting === "bookmark"}
            >
              {item.bookmarked ? "取消收藏" : "收藏"}
            </button>
            <button className="btn secondary" type="button" onClick={() => void onToggleLike()} disabled={acting === "like"}>
              {item.liked ? "取消点赞" : "点赞"}
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <h2 style={{ margin: "0 0 8px" }}>AI 摘要</h2>
            {detail.summary_text ? <p className="summary-block">{detail.summary_text}</p> : <div className="helper">暂无摘要</div>}
            {!!detail.key_points.length && (
              <ul className="summary-points">
                {detail.key_points.map((point, idx) => (
                  <li key={`${item.id}-${idx}`}>{point}</li>
                ))}
              </ul>
            )}
            {(detail.model_provider || detail.model_name || detail.model_version || detail.analyzed_at) && (
              <div className="helper" style={{ fontSize: 13 }}>
                模型：{detail.model_provider || "-"} / {detail.model_name || "-"} / {detail.model_version || "-"} ·
                {detail.analyzed_at ? ` ${new Date(detail.analyzed_at).toLocaleString()}` : " -"}
              </div>
            )}
          </div>

          {detail.note_body_md !== null && (
            <div style={{ marginTop: 18 }}>
              <h2 style={{ margin: "0 0 8px" }}>学习心得</h2>
              <pre className="note-preview">{detail.note_body_md || "暂无学习心得"}</pre>
            </div>
          )}
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        </section>
      </div>
    </main>
  );
}

function renderStatus(status: string): string {
  if (status === "pending") return "待分析";
  if (status === "running") return "分析中";
  if (status === "succeeded") return "成功";
  return "失败";
}
