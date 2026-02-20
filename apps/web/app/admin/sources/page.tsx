"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AdminTabs from "../../../components/AdminTabs";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { apiRequest } from "../../../lib/api";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";

type AdminSourceCreatorItem = {
  id: string;
  slug: string;
  display_name: string;
  source_domain: string;
  feed_url: string;
  homepage_url: string;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminSourceCreatorListResponse = { sources: AdminSourceCreatorItem[] };

type RefreshScope = "all" | "source";
type RefreshStatus = "queued" | "running" | "succeeded" | "failed" | "not_found";

type AggregateRefreshJobAccepted = {
  job_id: string;
  status: "queued";
  scope: RefreshScope;
  source_id: string | null;
  source_slug: string | null;
  message: string;
};

type AggregateRefreshJobStatus = {
  job_id: string;
  status: RefreshStatus;
  scope: RefreshScope | null;
  source_id: string | null;
  source_slug: string | null;
  total_sources: number | null;
  refreshed_items: number | null;
  failed_items: number | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

type SourceDraft = {
  display_name: string;
  source_domain: string;
  feed_url: string;
  homepage_url: string;
  is_active: boolean;
};

type SourceDraftMap = Record<string, SourceDraft>;

type SourceDeletedFilter = "all" | "active" | "deleted";
type SourceActiveFilter = "all" | "active" | "inactive";

type SourceQueryState = {
  keyword: string;
  deleted: SourceDeletedFilter;
  active: SourceActiveFilter;
};

const DEFAULT_QUERY: SourceQueryState = {
  keyword: "",
  deleted: "all",
  active: "all",
};

const EMPTY_CREATE_FORM = {
  slug: "",
  display_name: "",
  source_domain: "",
  feed_url: "",
  homepage_url: "",
  is_active: true,
};

const SELECT_CLASS =
  "h-10 rounded-md border border-border bg-white px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";
const TABLE_CLASS =
  "w-full min-w-[1100px] border-collapse text-sm [&_th]:border-b [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2";

export default function AdminSourcesPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [sources, setSources] = useState<AdminSourceCreatorItem[]>([]);
  const [drafts, setDrafts] = useState<SourceDraftMap>({});

  const [keyword, setKeyword] = useState(DEFAULT_QUERY.keyword);
  const [deletedFilter, setDeletedFilter] = useState<SourceDeletedFilter>(DEFAULT_QUERY.deleted);
  const [activeFilter, setActiveFilter] = useState<SourceActiveFilter>(DEFAULT_QUERY.active);
  const [query, setQuery] = useState<SourceQueryState>(DEFAULT_QUERY);

  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [refreshJob, setRefreshJob] = useState<AggregateRefreshJobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actingSourceId, setActingSourceId] = useState("");
  const [creating, setCreating] = useState(false);
  const [triggeringRefresh, setTriggeringRefresh] = useState(false);

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      setMe(cached);
    }

    apiRequest<UserPublic>("/me", {}, true)
      .then((user) => {
        if (!user.is_admin) {
          setError("你不是管理员，无法访问管理后台");
          setLoading(false);
          return;
        }
        setMe(user);
        setStoredUser(user);
        void fetchSources(DEFAULT_QUERY);
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  useEffect(() => {
    if (!refreshJob) {
      return;
    }
    if (refreshJob.status !== "queued" && refreshJob.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      apiRequest<AggregateRefreshJobStatus>(`/admin/aggregates/refresh/${refreshJob.job_id}`, {}, true)
        .then((job) => {
          setRefreshJob(job);
          if (job.status === "succeeded") {
            setSuccess(
              `聚合刷新完成：刷新 ${job.refreshed_items ?? 0} 条，失败 ${job.failed_items ?? 0} 条（来源 ${job.total_sources ?? 0}）`,
            );
          }
          if (job.status === "failed") {
            setError(job.error_message || "聚合刷新失败");
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "查询刷新任务状态失败");
        });
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshJob]);

  async function fetchSources(nextQuery: SourceQueryState) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextQuery.keyword) params.set("keyword", nextQuery.keyword);
      params.set("deleted", nextQuery.deleted);
      params.set("active", nextQuery.active);

      const path = `/admin/sources?${params.toString()}`;
      const data = await apiRequest<AdminSourceCreatorListResponse>(path, {}, true);
      setSources(data.sources);

      const nextDrafts: SourceDraftMap = {};
      for (const source of data.sources) {
        nextDrafts[source.id] = {
          display_name: source.display_name,
          source_domain: source.source_domain,
          feed_url: source.feed_url,
          homepage_url: source.homepage_url,
          is_active: source.is_active,
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载信息源失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextQuery: SourceQueryState = {
      keyword: keyword.trim(),
      deleted: deletedFilter,
      active: activeFilter,
    };
    setQuery(nextQuery);
    await fetchSources(nextQuery);
  }

  async function onCreateSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setSuccess("");
    setCreating(true);
    try {
      await apiRequest<AdminSourceCreatorItem>(
        "/admin/sources",
        {
          method: "POST",
          body: JSON.stringify({
            slug: createForm.slug.trim(),
            display_name: createForm.display_name.trim(),
            source_domain: createForm.source_domain.trim(),
            feed_url: createForm.feed_url.trim(),
            homepage_url: createForm.homepage_url.trim(),
            is_active: createForm.is_active,
          }),
        },
        true,
      );
      setSuccess("已创建信息源");
      setCreateForm(EMPTY_CREATE_FORM);
      await fetchSources(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建信息源失败");
    } finally {
      setCreating(false);
    }
  }

  async function onSaveSource(sourceId: string) {
    const draft = drafts[sourceId];
    if (!draft) {
      return;
    }

    setError("");
    setSuccess("");
    setActingSourceId(sourceId);
    try {
      await apiRequest<AdminSourceCreatorItem>(
        `/admin/sources/${sourceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            display_name: draft.display_name,
            source_domain: draft.source_domain,
            feed_url: draft.feed_url,
            homepage_url: draft.homepage_url,
            is_active: draft.is_active,
          }),
        },
        true,
      );
      setSuccess("已更新信息源");
      await fetchSources(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新信息源失败");
    } finally {
      setActingSourceId("");
    }
  }

  async function onDeleteSource(sourceId: string, slug: string) {
    if (!window.confirm(`确认删除信息源 ${slug} 吗？`)) {
      return;
    }

    setError("");
    setSuccess("");
    setActingSourceId(sourceId);
    try {
      await apiRequest<{ message: string }>(`/admin/sources/${sourceId}`, { method: "DELETE" }, true);
      setSuccess(`已删除信息源 ${slug}`);
      await fetchSources(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除信息源失败");
    } finally {
      setActingSourceId("");
    }
  }

  async function onRestoreSource(sourceId: string, slug: string) {
    setError("");
    setSuccess("");
    setActingSourceId(sourceId);
    try {
      await apiRequest<{ message: string }>(`/admin/sources/${sourceId}/restore`, { method: "POST" }, true);
      setSuccess(`已恢复信息源 ${slug}`);
      await fetchSources(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复信息源失败");
    } finally {
      setActingSourceId("");
    }
  }

  async function onTriggerRefresh(source?: AdminSourceCreatorItem) {
    setError("");
    setSuccess("");
    setTriggeringRefresh(true);
    try {
      const queryString = source ? `?source_id=${encodeURIComponent(source.id)}` : "";
      const accepted = await apiRequest<AggregateRefreshJobAccepted>(
        `/admin/aggregates/refresh${queryString}`,
        { method: "POST" },
        true,
      );
      setRefreshJob({
        job_id: accepted.job_id,
        status: accepted.status,
        scope: accepted.scope,
        source_id: accepted.source_id,
        source_slug: accepted.source_slug,
        total_sources: null,
        refreshed_items: null,
        failed_items: null,
        created_at: null,
        started_at: null,
        finished_at: null,
        error_message: null,
      });
      setSuccess(accepted.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交刷新任务失败");
    } finally {
      setTriggeringRefresh(false);
    }
  }

  const canRender = useMemo(() => Boolean(me?.is_admin), [me]);

  if (loading && sources.length === 0) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[1080px]">
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!canRender) {
    return (
      <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[1080px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">管理后台</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "无权限"}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/")}>
                返回首页
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[1080px]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">管理后台 · 聚合源</CardTitle>
            <AdminTabs />
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-wrap gap-2" onSubmit={onSearch}>
              <Input
                className="min-w-[220px] flex-1"
                placeholder="按 slug / 名称 / 域名 / 链接搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <select
                className={SELECT_CLASS}
                value={deletedFilter}
                onChange={(e) => setDeletedFilter(e.target.value as SourceDeletedFilter)}
              >
                <option value="all">全部删除状态</option>
                <option value="active">未删除</option>
                <option value="deleted">已删除</option>
              </select>
              <select
                className={SELECT_CLASS}
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as SourceActiveFilter)}
              >
                <option value="all">全部启用状态</option>
                <option value="active">已启用</option>
                <option value="inactive">已停用</option>
              </select>
              <Button type="submit">搜索</Button>
              <Button variant="secondary" type="button" disabled={triggeringRefresh} onClick={() => void onTriggerRefresh()}>
                {triggeringRefresh ? "提交中..." : "后台刷新全部"}
              </Button>
            </form>

            <form className="space-y-4" onSubmit={onCreateSource}>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[140px] flex-1"
                  placeholder="slug（如 openai-research）"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, slug: e.target.value }))}
                />
                <Input
                  className="min-w-[180px] flex-1"
                  placeholder="展示名称"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, display_name: e.target.value }))}
                />
                <Input
                  className="min-w-[180px] flex-1"
                  placeholder="source_domain（如 openai.com）"
                  value={createForm.source_domain}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, source_domain: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[260px] flex-1"
                  placeholder="feed_url（RSS/Atom）"
                  value={createForm.feed_url}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, feed_url: e.target.value }))}
                />
                <Input
                  className="min-w-[260px] flex-1"
                  placeholder="homepage_url"
                  value={createForm.homepage_url}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, homepage_url: e.target.value }))}
                />
                <label className="flex min-w-[90px] items-center gap-2">
                  <input
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    checked={createForm.is_active}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  启用
                </label>
                <Button type="submit" disabled={creating}>
                  {creating ? "创建中..." : "新增信息源"}
                </Button>
              </div>
            </form>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

            {refreshJob && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <div className="font-semibold text-foreground">刷新任务：{refreshJob.job_id}</div>
                <div className="text-sm text-foreground">
                  状态：{renderRefreshStatus(refreshJob.status)}
                  {refreshJob.scope ? ` · 范围：${refreshJob.scope === "all" ? "全部源" : "单个源"}` : ""}
                  {refreshJob.source_slug ? ` · 信息源：${refreshJob.source_slug}` : ""}
                </div>
                {refreshJob.status === "succeeded" && (
                  <div className="text-sm text-foreground">
                    来源数：{refreshJob.total_sources ?? 0}，刷新成功：{refreshJob.refreshed_items ?? 0}，失败：
                    {refreshJob.failed_items ?? 0}
                  </div>
                )}
                {refreshJob.error_message && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {refreshJob.error_message}
                  </div>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className={TABLE_CLASS}>
                <thead>
                  <tr>
                    <th>Slug</th>
                    <th>名称</th>
                    <th>域名</th>
                    <th>Feed URL</th>
                    <th>主页 URL</th>
                    <th>启用</th>
                    <th>删除状态</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => {
                    const draft = drafts[source.id] || {
                      display_name: source.display_name,
                      source_domain: source.source_domain,
                      feed_url: source.feed_url,
                      homepage_url: source.homepage_url,
                      is_active: source.is_active,
                    };

                    return (
                      <tr key={source.id}>
                        <td>{source.slug}</td>
                        <td>
                          <Input
                            value={draft.display_name}
                            disabled={source.is_deleted}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [source.id]: { ...draft, display_name: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <Input
                            value={draft.source_domain}
                            disabled={source.is_deleted}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [source.id]: { ...draft, source_domain: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <Input
                            value={draft.feed_url}
                            disabled={source.is_deleted}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [source.id]: { ...draft, feed_url: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <Input
                            value={draft.homepage_url}
                            disabled={source.is_deleted}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [source.id]: { ...draft, homepage_url: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="h-4 w-4 accent-blue-600"
                            type="checkbox"
                            checked={draft.is_active}
                            disabled={source.is_deleted}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [source.id]: { ...draft, is_active: e.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td>
                          {source.is_deleted
                            ? `已删除${source.deleted_at ? `（${new Date(source.deleted_at).toLocaleString()}）` : ""}`
                            : "未删除"}
                        </td>
                        <td>{new Date(source.updated_at).toLocaleString()}</td>
                        <td>
                          {!source.is_deleted && (
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" onClick={() => void onSaveSource(source.id)} disabled={actingSourceId === source.id}>
                                {actingSourceId === source.id ? "处理中..." : "保存"}
                              </Button>
                              <Button
                                variant="secondary"
                                type="button"
                                onClick={() => void onTriggerRefresh(source)}
                                disabled={triggeringRefresh}
                              >
                                后台刷新
                              </Button>
                              <Button
                                variant="secondary"
                                type="button"
                                onClick={() => void onDeleteSource(source.id, source.slug)}
                                disabled={actingSourceId === source.id}
                              >
                                删除
                              </Button>
                            </div>
                          )}
                          {source.is_deleted && (
                            <Button
                              variant="secondary"
                              type="button"
                              onClick={() => void onRestoreSource(source.id, source.slug)}
                              disabled={actingSourceId === source.id}
                            >
                              {actingSourceId === source.id ? "处理中..." : "恢复"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function renderRefreshStatus(status: RefreshStatus): string {
  if (status === "queued") return "排队中";
  if (status === "running") return "执行中";
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  return "未找到";
}
