"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";
import { clearAuth, UserPublic } from "../../lib/auth";
import { FeedItem, FeedListResponse } from "../../lib/feed";

type FeedScope = "following" | "unfollowed";

export default function FeedPage() {
  const router = useRouter();
  const [scope, setScope] = useState<FeedScope>("following");
  const [tag, setTag] = useState("");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");

  useEffect(() => {
    apiRequest<UserPublic>("/me", {}, true)
      .then(() => fetchFeed({ nextScope: "following", nextTag: "" }))
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchFeed({ nextScope, nextTag }: { nextScope: FeedScope; nextTag: string }) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("scope", nextScope);
      if (nextTag.trim()) params.set("tag", nextTag.trim().toLowerCase());
      const path = `/feed?${params.toString()}`;
      const data = await apiRequest<FeedListResponse>(path, {}, true);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载信息流失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetchFeed({ nextScope: scope, nextTag: tag });
  }

  async function switchScope(nextScope: FeedScope) {
    setScope(nextScope);
    await fetchFeed({ nextScope, nextTag: tag });
  }

  async function onToggleLike(item: FeedItem) {
    setActingId(`like:${item.item_type}:${item.id}`);
    setError("");
    try {
      const method = item.liked ? "DELETE" : "POST";
      const path =
        item.item_type === "note" ? `/social/likes/notes/${item.id}` : `/social/likes/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchFeed({ nextScope: scope, nextTag: tag });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  async function onToggleBookmark(item: FeedItem) {
    setActingId(`bookmark:${item.item_type}:${item.id}`);
    setError("");
    try {
      const method = item.bookmarked ? "DELETE" : "POST";
      const path =
        item.item_type === "note"
          ? `/social/bookmarks/notes/${item.id}`
          : `/social/bookmarks/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchFeed({ nextScope: scope, nextTag: tag });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  async function onToggleFollow(item: FeedItem) {
    setActingId(`follow:${item.creator_kind}:${item.creator_id}`);
    setError("");
    try {
      const method = item.following ? "DELETE" : "POST";
      const path =
        item.creator_kind === "user"
          ? `/social/follows/users/${item.creator_id}`
          : `/social/follows/sources/${item.creator_id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchFeed({ nextScope: scope, nextTag: tag });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  function openDetail(item: FeedItem) {
    if (item.item_type === "note") {
      router.push(`/notes/public/${item.id}`);
      return;
    }
    window.open(item.source_url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>广场信息流</h1>
            <button className="btn secondary" type="button" onClick={() => router.push("/notes")}>
              我的笔记
            </button>
          </div>

          <div className="tabs" style={{ marginTop: 16 }}>
            <button className={scope === "following" ? "tab active" : "tab"} type="button" onClick={() => void switchScope("following")}>
              关注
            </button>
            <button className={scope === "unfollowed" ? "tab active" : "tab"} type="button" onClick={() => void switchScope("unfollowed")}>
              未关注
            </button>
          </div>

          <form className="row" onSubmit={onSearch}>
            <input
              style={{ flex: 1, minWidth: 220 }}
              placeholder="按标签筛选（例如：openai）"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <button className="btn secondary" type="submit">
              筛选
            </button>
          </form>

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          {loading && <div className="helper" style={{ marginTop: 12 }}>加载中...</div>}
          {!loading && items.length === 0 && <div className="helper" style={{ marginTop: 12 }}>当前没有内容</div>}

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {items.map((item) => (
              <article key={`${item.item_type}-${item.id}`} className="note-item">
                <div>
                  <h3 style={{ margin: "0 0 6px" }}>{item.source_title || item.source_url}</h3>
                  <div className="helper" style={{ fontSize: 13 }}>
                    {item.creator_name} · {item.source_domain} · {new Date(item.updated_at).toLocaleString()}
                  </div>
                  {!!item.tags.length && (
                    <div className="row" style={{ marginTop: 8 }}>
                      {item.tags.map((tagItem) => (
                        <span key={`${item.id}-${tagItem}`} className="pill">
                          #{tagItem}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {item.summary_excerpt && <p className="summary-block" style={{ margin: 0 }}>{item.summary_excerpt}</p>}

                <div className="row" style={{ alignItems: "center" }}>
                  <span className="pill">{item.bookmark_count} 收藏</span>
                  <span className="pill">{item.like_count} 点赞</span>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={actingId === `follow:${item.creator_kind}:${item.creator_id}`}
                    onClick={() => void onToggleFollow(item)}
                  >
                    {item.following ? "取消关注" : "关注"}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={actingId === `bookmark:${item.item_type}:${item.id}`}
                    onClick={() => void onToggleBookmark(item)}
                  >
                    {item.bookmarked ? "取消收藏" : "收藏"}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={actingId === `like:${item.item_type}:${item.id}`}
                    onClick={() => void onToggleLike(item)}
                  >
                    {item.liked ? "取消点赞" : "点赞"}
                  </button>
                  <button className="btn" type="button" onClick={() => openDetail(item)}>
                    查看
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

