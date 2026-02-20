"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AnalysisStatusBadge from "../../../components/AnalysisStatusBadge";
import AdminTabs from "../../../components/AdminTabs";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { apiRequest } from "../../../lib/api";
import { AnalysisStatus } from "../../../lib/analysis-status";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";

type AdminSourceCreatorItem = {
  id: string;
  slug: string;
  is_deleted: boolean;
};

type AdminSourceCreatorListResponse = { sources: AdminSourceCreatorItem[] };

type AggregateStatusFilter = AnalysisStatus | "";

type AdminAggregateItem = {
  id: string;
  source_creator_id: string;
  source_slug: string;
  source_display_name: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  published_at: string | null;
  updated_at: string;
};

type AdminAggregateItemListResponse = {
  items: AdminAggregateItem[];
};

type AggregateQueryState = {
  status: AggregateStatusFilter;
  keyword: string;
  sourceId: string;
  offset: number;
  limit: number;
};

const AGGREGATE_PAGE_SIZE = 20;
const DEFAULT_AGGREGATE_QUERY: AggregateQueryState = {
  status: "failed",
  keyword: "",
  sourceId: "",
  offset: 0,
  limit: AGGREGATE_PAGE_SIZE,
};

const SELECT_CLASS =
  "h-10 rounded-md border border-border bg-white px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";
const TABLE_CLASS =
  "w-full min-w-[1100px] border-collapse text-sm [&_th]:border-b [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2";

export default function AdminAggregatesPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [sources, setSources] = useState<AdminSourceCreatorItem[]>([]);

  const [aggregateItems, setAggregateItems] = useState<AdminAggregateItem[]>([]);
  const [aggregateKeyword, setAggregateKeyword] = useState(DEFAULT_AGGREGATE_QUERY.keyword);
  const [aggregateStatusFilter, setAggregateStatusFilter] = useState<AggregateStatusFilter>(DEFAULT_AGGREGATE_QUERY.status);
  const [aggregateSourceIdFilter, setAggregateSourceIdFilter] = useState(DEFAULT_AGGREGATE_QUERY.sourceId);
  const [aggregateOffset, setAggregateOffset] = useState(DEFAULT_AGGREGATE_QUERY.offset);
  const [aggregateHasNext, setAggregateHasNext] = useState(false);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actingAggregateId, setActingAggregateId] = useState("");

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      setMe(cached);
    }

    apiRequest<UserPublic>("/me", {}, true)
      .then(async (user) => {
        if (!user.is_admin) {
          setError("你不是管理员，无法访问管理后台");
          setLoading(false);
          return;
        }
        setMe(user);
        setStoredUser(user);
        await Promise.all([fetchSources(), fetchAggregateItems(DEFAULT_AGGREGATE_QUERY)]);
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  async function fetchSources() {
    try {
      const params = new URLSearchParams();
      params.set("deleted", "all");
      params.set("active", "all");
      const path = `/admin/sources?${params.toString()}`;
      const data = await apiRequest<AdminSourceCreatorListResponse>(path, {}, true);
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载信息源失败");
    }
  }

  async function fetchAggregateItems(nextQuery: AggregateQueryState) {
    setAggregateLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextQuery.status) params.set("status", nextQuery.status);
      if (nextQuery.keyword) params.set("keyword", nextQuery.keyword);
      if (nextQuery.sourceId) params.set("source_id", nextQuery.sourceId);
      params.set("offset", String(nextQuery.offset));
      params.set("limit", String(nextQuery.limit));
      const path = `/admin/aggregates/items?${params.toString()}`;
      const data = await apiRequest<AdminAggregateItemListResponse>(path, {}, true);
      setAggregateItems(data.items);
      setAggregateHasNext(data.items.length >= nextQuery.limit);
      setAggregateOffset(nextQuery.offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载聚合条目失败");
    } finally {
      setAggregateLoading(false);
    }
  }

  async function onSearchAggregates(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetchAggregateItems({
      status: aggregateStatusFilter,
      keyword: aggregateKeyword.trim(),
      sourceId: aggregateSourceIdFilter,
      offset: 0,
      limit: AGGREGATE_PAGE_SIZE,
    });
  }

  async function onChangeAggregatePage(direction: "prev" | "next") {
    const nextOffset =
      direction === "prev"
        ? Math.max(0, aggregateOffset - AGGREGATE_PAGE_SIZE)
        : aggregateOffset + AGGREGATE_PAGE_SIZE;
    await fetchAggregateItems({
      status: aggregateStatusFilter,
      keyword: aggregateKeyword.trim(),
      sourceId: aggregateSourceIdFilter,
      offset: nextOffset,
      limit: AGGREGATE_PAGE_SIZE,
    });
  }

  async function onReanalyzeAggregate(item: AdminAggregateItem) {
    setError("");
    setSuccess("");
    setActingAggregateId(item.id);
    try {
      const result = await apiRequest<{ message: string }>(
        `/admin/aggregates/items/${item.id}/reanalyze`,
        { method: "POST" },
        true,
      );
      setSuccess(`${item.source_slug}: ${result.message}`);
      await fetchAggregateItems({
        status: aggregateStatusFilter,
        keyword: aggregateKeyword.trim(),
        sourceId: aggregateSourceIdFilter,
        offset: aggregateOffset,
        limit: AGGREGATE_PAGE_SIZE,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "触发聚合条目重试失败");
    } finally {
      setActingAggregateId("");
    }
  }

  const canRender = useMemo(() => Boolean(me?.is_admin), [me]);

  if (loading && aggregateItems.length === 0) {
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
            <CardTitle className="text-2xl">管理后台 · 聚合条目</CardTitle>
            <AdminTabs />
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-wrap gap-2" onSubmit={onSearchAggregates}>
              <select
                className={SELECT_CLASS}
                value={aggregateStatusFilter}
                onChange={(e) => setAggregateStatusFilter(e.target.value as AggregateStatusFilter)}
              >
                <option value="">全部状态</option>
                <option value="pending">待分析</option>
                <option value="running">分析中</option>
                <option value="succeeded">成功</option>
                <option value="failed">失败</option>
              </select>
              <select className={SELECT_CLASS} value={aggregateSourceIdFilter} onChange={(e) => setAggregateSourceIdFilter(e.target.value)}>
                <option value="">全部信息源</option>
                {sources
                  .filter((source) => !source.is_deleted)
                  .map((source) => (
                    <option key={`aggregate-filter-${source.id}`} value={source.id}>
                      {source.slug}
                    </option>
                  ))}
              </select>
              <Input
                className="min-w-[220px] flex-1"
                placeholder="按来源 slug / 标题 / 域名 / 错误信息搜索"
                value={aggregateKeyword}
                onChange={(e) => setAggregateKeyword(e.target.value)}
              />
              <Button type="submit" disabled={aggregateLoading}>
                {aggregateLoading ? "查询中..." : "查询条目"}
              </Button>
            </form>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

            <div className="overflow-x-auto">
              <table className={TABLE_CLASS}>
                <thead>
                  <tr>
                    <th>信息源</th>
                    <th>标题</th>
                    <th>状态</th>
                    <th>失败原因</th>
                    <th>发布时间</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.source_slug || item.source_display_name}</td>
                      <td>{item.source_title || item.source_url}</td>
                      <td>
                        <AnalysisStatusBadge status={item.analysis_status} />
                      </td>
                      <td>{item.analysis_error || "-"}</td>
                      <td>{item.published_at ? new Date(item.published_at).toLocaleString() : "-"}</td>
                      <td>{new Date(item.updated_at).toLocaleString()}</td>
                      <td>
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => void onReanalyzeAggregate(item)}
                          disabled={actingAggregateId === item.id}
                        >
                          {actingAggregateId === item.id ? "处理中..." : "重试分析"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {aggregateItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center">
                        暂无匹配的聚合条目
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                type="button"
                disabled={aggregateLoading || aggregateOffset === 0}
                onClick={() => void onChangeAggregatePage("prev")}
              >
                上一页
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={aggregateLoading || !aggregateHasNext}
                onClick={() => void onChangeAggregatePage("next")}
              >
                下一页
              </Button>
              <span className="self-center text-sm text-muted-foreground">
                第 {Math.floor(aggregateOffset / AGGREGATE_PAGE_SIZE) + 1} 页 · 每页 {AGGREGATE_PAGE_SIZE} 条
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
