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
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const nextScope = parseScope(query.get("scope"));
    const nextTag = (query.get("tag") || "").trim();
    const nextKeyword = (query.get("keyword") || "").trim();

    apiRequest<UserPublic>("/me", {}, true)
      .then(async () => {
        setScope(nextScope);
        setTag(nextTag);
        setKeyword(nextKeyword);
        await fetchFeed({
          nextScope,
          nextTag,
          nextKeyword,
        });
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchFeed({
    nextScope,
    nextTag,
    nextKeyword,
  }: {
    nextScope: FeedScope;
    nextTag: string;
    nextKeyword: string;
  }) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("scope", nextScope);
      if (nextTag.trim()) params.set("tag", nextTag.trim().toLowerCase());
      if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
      const path = `/feed?${params.toString()}`;
      const data = await apiRequest<FeedListResponse>(path, {}, true);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载信息流失败");
    } finally {
      setLoading(false);
    }
  }

  function pushQuery(nextScope: FeedScope, nextTag: string, nextKeyword: string) {
    const params = new URLSearchParams();
    params.set("scope", nextScope);
    if (nextTag.trim()) params.set("tag", nextTag.trim().toLowerCase());
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    router.replace(`/feed?${params.toString()}`);
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
    pushQuery(scope, tag, keyword);
  }

  async function switchScope(nextScope: FeedScope) {
    if (scope === nextScope) return;
    setScope(nextScope);
    await fetchFeed({ nextScope, nextTag: tag, nextKeyword: keyword });
    pushQuery(nextScope, tag, keyword);
  }

  async function onToggleLike(item: FeedItem) {
    setActingId(`like:${item.item_type}:${item.id}`);
    setError("");
    try {
      const method = item.liked ? "DELETE" : "POST";
      const path =
        item.item_type === "note" ? `/social/likes/notes/${item.id}` : `/social/likes/aggregates/${item.id}`;
      await apiRequest<{ message: string }>(path, { method }, true);
      await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
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
      await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
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
      await fetchFeed({ nextScope: scope, nextTag: tag, nextKeyword: keyword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActingId("");
    }
  }

  function openDetail(item: FeedItem) {
    router.push(`/feed/items/${item.item_type}/${item.id}`);
  }

  function formatPublishedAt(item: FeedItem) {
    return new Date(item.published_at ?? item.updated_at).toLocaleString();
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
              placeholder="关键词（标题/链接/创作者/摘要）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <input
              style={{ flex: 1, minWidth: 220 }}
              placeholder="按标签筛选（例如：#openai 或 #大模型）"
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
                    {item.creator_name} · {item.source_domain} · 发布时间 {formatPublishedAt(item)}
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

function parseScope(raw: string | null): FeedScope {
  if (raw === "unfollowed") return "unfollowed";
  return "following";
}
