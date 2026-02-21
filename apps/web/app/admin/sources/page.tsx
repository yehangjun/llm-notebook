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
type RefreshFailureStage = "feed_fetch" | "feed_parse" | "content_fetch" | "llm_request" | "llm_parse" | "db_write" | "unknown";

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
  failures: AggregateRefreshFailureItem[];
};

type AggregateRefreshFailureItem = {
  source_id: string | null;
  source_slug: string | null;
  item_id: string | null;
  source_url: string | null;
  stage: RefreshFailureStage;
  error_class: string;
  error_message: string;
  elapsed_ms: number | null;
  retryable: boolean;
  created_at: string;
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
  const [failureStageFilter, setFailureStageFilter] = useState<RefreshFailureStage | "">("");
  const [failureSourceFilter, setFailureSourceFilter] = useState("");
  const [failureKeyword, setFailureKeyword] = useState("");
  const [retryingFailureKey, setRetryingFailureKey] = useState("");

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
        failures: [],
      });
      setSuccess(accepted.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交刷新任务失败");
    } finally {
      setTriggeringRefresh(false);
    }
  }

  async function onRetryFailure(failure: AggregateRefreshFailureItem, key: string) {
    setError("");
    setSuccess("");
    setRetryingFailureKey(key);
    try {
      if (failure.item_id) {
        const result = await apiRequest<{ message: string }>(
          `/admin/aggregates/items/${failure.item_id}/reanalyze`,
          { method: "POST" },
          true,
        );
        setSuccess(`${failure.source_slug || "聚合条目"}: ${result.message}`);
        return;
      }

      if (failure.source_id) {
        const accepted = await apiRequest<AggregateRefreshJobAccepted>(
          `/admin/aggregates/refresh?source_id=${encodeURIComponent(failure.source_id)}`,
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
          failures: [],
        });
        setSuccess(`${failure.source_slug || "信息源"}: ${accepted.message}`);
        return;
      }

      setError("该失败记录缺少可重试目标（item_id/source_id）");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    } finally {
      setRetryingFailureKey("");
    }
  }

  const failureSourceOptions = useMemo(() => {
    if (!refreshJob?.failures.length) {
      return [];
    }
    const values = new Set<string>();
    for (const failure of refreshJob.failures) {
      if (!failure.source_slug) {
        continue;
      }
      values.add(failure.source_slug);
    }
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
  }, [refreshJob]);

  const filteredFailures = useMemo(() => {
    if (!refreshJob?.failures.length) {
      return [];
    }
    const keywordValue = failureKeyword.trim().toLowerCase();
    return refreshJob.failures.filter((failure) => {
      if (failureStageFilter && failure.stage !== failureStageFilter) {
        return false;
      }
      if (failureSourceFilter && (failure.source_slug || "") !== failureSourceFilter) {
        return false;
      }
      if (!keywordValue) {
        return true;
      }
      const haystack = [
        failure.source_url || "",
        failure.error_class || "",
        failure.error_message || "",
        failure.item_id || "",
        failure.source_slug || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keywordValue);
    });
  }, [refreshJob, failureKeyword, failureSourceFilter, failureStageFilter]);

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
                <div className="text-xs text-muted-foreground">
                  创建：{refreshJob.created_at ? new Date(refreshJob.created_at).toLocaleString() : "-"} · 开始：
                  {refreshJob.started_at ? new Date(refreshJob.started_at).toLocaleString() : "-"} · 结束：
                  {refreshJob.finished_at ? new Date(refreshJob.finished_at).toLocaleString() : "-"}
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
                {refreshJob.failures.length > 0 && (
                  <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2.5">
                    <div className="text-sm font-semibold text-foreground">
                      失败明细：{filteredFailures.length} / {refreshJob.failures.length}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        className={SELECT_CLASS}
                        value={failureStageFilter}
                        onChange={(e) => setFailureStageFilter(e.target.value as RefreshFailureStage | "")}
                      >
                        <option value="">全部阶段</option>
                        <option value="feed_fetch">feed 抓取</option>
                        <option value="feed_parse">feed 解析</option>
                        <option value="content_fetch">正文抓取</option>
                        <option value="llm_request">LLM 请求</option>
                        <option value="llm_parse">LLM 解析</option>
                        <option value="db_write">数据写入</option>
                        <option value="unknown">未知</option>
                      </select>
                      <select className={SELECT_CLASS} value={failureSourceFilter} onChange={(e) => setFailureSourceFilter(e.target.value)}>
                        <option value="">全部来源</option>
                        {failureSourceOptions.map((slug) => (
                          <option key={`failure-source-${slug}`} value={slug}>
                            {slug}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="min-w-[240px] flex-1"
                        placeholder="按 URL / 错误信息 / item_id 搜索"
                        value={failureKeyword}
                        onChange={(e) => setFailureKeyword(e.target.value)}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1000px] border-collapse text-xs [&_th]:border-b [&_th]:border-border [&_th]:bg-white/40 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
                        <thead>
                          <tr>
                            <th>时间</th>
                            <th>来源</th>
                            <th>阶段</th>
                            <th>目标</th>
                            <th>错误</th>
                            <th>耗时</th>
                            <th>重试</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFailures.map((failure, index) => {
                            const retryKey = `${failure.created_at}-${failure.stage}-${failure.item_id || failure.source_id || index}`;
                            const targetLabel = failure.item_id ? "条目" : "来源";
                            return (
                              <tr key={retryKey}>
                                <td>{new Date(failure.created_at).toLocaleString()}</td>
                                <td>{failure.source_slug || "-"}</td>
                                <td>{renderFailureStage(failure.stage)}</td>
                                <td>
                                  <div className="space-y-1">
                                    <div>
                                      {targetLabel}
                                      {failure.item_id ? ` ${failure.item_id.slice(0, 8)}` : ""}
                                    </div>
                                    {failure.source_url ? (
                                      <a
                                        className="break-all text-primary underline-offset-2 hover:underline"
                                        href={failure.source_url}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {failure.source_url}
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div className="max-w-[320px] break-words">
                                    <div className="font-medium">{failure.error_class}</div>
                                    <div>{failure.error_message}</div>
                                  </div>
                                </td>
                                <td>{failure.elapsed_ms != null ? `${failure.elapsed_ms}ms` : "-"}</td>
                                <td>
                                  {failure.item_id || failure.source_id ? (
                                    <Button
                                      variant="secondary"
                                      type="button"
                                      disabled={retryingFailureKey === retryKey}
                                      onClick={() => void onRetryFailure(failure, retryKey)}
                                    >
                                      {retryingFailureKey === retryKey ? "处理中..." : failure.item_id ? "重试条目" : "重试来源"}
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground">缺少重试目标</span>
                                  )}
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {failure.retryable ? "建议重试" : "建议先修复配置后再重试"}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
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

function renderFailureStage(stage: RefreshFailureStage): string {
  if (stage === "feed_fetch") return "feed 抓取";
  if (stage === "feed_parse") return "feed 解析";
  if (stage === "content_fetch") return "正文抓取";
  if (stage === "llm_request") return "LLM 请求";
  if (stage === "llm_parse") return "LLM 解析";
  if (stage === "db_write") return "数据写入";
  return "未知";
}
