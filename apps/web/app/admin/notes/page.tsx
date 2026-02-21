"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AnalysisStatusBadge from "../../../components/AnalysisStatusBadge";
import AdminTabs from "../../../components/AdminTabs";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { apiRequest } from "../../../lib/api";
import { clearAuth, getStoredUser, setStoredUser, UserPublic } from "../../../lib/auth";

type AdminNoteItem = {
  id: string;
  owner_user_id: string;
  owner_is_deleted: boolean;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  visibility: "private" | "public";
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  analysis_error: string | null;
  failure_error_code: string | null;
  failure_error_message: string | null;
  failure_error_stage: "content_fetch" | "llm_request" | "llm_parse" | "unknown" | null;
  failure_error_class: string | null;
  failure_retryable: boolean | null;
  failure_elapsed_ms: number | null;
  failure_analyzed_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  updated_at: string;
};

type AdminNoteListResponse = { notes: AdminNoteItem[] };
type AdminStatusFilter = "" | "pending" | "running" | "succeeded" | "failed";
type AdminVisibilityFilter = "" | "private" | "public";
type AdminDeletedFilter = "all" | "active" | "deleted";
type AdminFailureStageFilter = "" | "content_fetch" | "llm_request" | "llm_parse" | "unknown";
type AdminRetryableFilter = "all" | "retryable" | "non_retryable";

type NotesQueryState = {
  keyword: string;
  ownerUserId: string;
  status: AdminStatusFilter;
  visibility: AdminVisibilityFilter;
  deleted: AdminDeletedFilter;
  failureStage: AdminFailureStageFilter;
  retryable: AdminRetryableFilter;
};

const DEFAULT_QUERY: NotesQueryState = {
  keyword: "",
  ownerUserId: "",
  status: "",
  visibility: "",
  deleted: "all",
  failureStage: "",
  retryable: "all",
};

const SELECT_CLASS =
  "h-10 rounded-md border border-border bg-white px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

export default function AdminNotesPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [notes, setNotes] = useState<AdminNoteItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>("");
  const [visibilityFilter, setVisibilityFilter] = useState<AdminVisibilityFilter>("");
  const [deletedFilter, setDeletedFilter] = useState<AdminDeletedFilter>("all");
  const [failureStageFilter, setFailureStageFilter] = useState<AdminFailureStageFilter>("");
  const [retryableFilter, setRetryableFilter] = useState<AdminRetryableFilter>("all");
  const [query, setQuery] = useState<NotesQueryState>(DEFAULT_QUERY);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingNoteId, setActingNoteId] = useState("");

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
        void fetchNotes(DEFAULT_QUERY);
      })
      .catch(() => {
        clearAuth();
        router.push("/auth");
      });
  }, [router]);

  async function fetchNotes(q: NotesQueryState) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.keyword) params.set("keyword", q.keyword);
      if (q.ownerUserId) params.set("owner_user_id", q.ownerUserId);
      if (q.status) params.set("status", q.status);
      if (q.visibility) params.set("visibility", q.visibility);
      params.set("deleted", q.deleted);
      const path = params.toString() ? `/admin/notes?${params.toString()}` : "/admin/notes";
      const data = await apiRequest<AdminNoteListResponse>(path, {}, true);
      setNotes(data.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载笔记失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextQuery: NotesQueryState = {
      keyword: keyword.trim(),
      ownerUserId: ownerUserId.trim(),
      status: statusFilter,
      visibility: visibilityFilter,
      deleted: deletedFilter,
      failureStage: failureStageFilter,
      retryable: retryableFilter,
    };
    setQuery(nextQuery);
    await fetchNotes(nextQuery);
  }

  async function onDeleteNote(noteId: string) {
    if (!window.confirm("确认删除这条笔记吗？删除后可在管理后台恢复。")) {
      return;
    }

    setSuccess("");
    setError("");
    setActingNoteId(noteId);
    try {
      await apiRequest<{ message: string }>(`/admin/notes/${noteId}`, { method: "DELETE" }, true);
      setSuccess("已删除笔记");
      await fetchNotes(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActingNoteId("");
    }
  }

  async function onRestoreNote(noteId: string) {
    setSuccess("");
    setError("");
    setActingNoteId(noteId);
    try {
      await apiRequest<{ message: string }>(`/admin/notes/${noteId}/restore`, { method: "POST" }, true);
      setSuccess("已恢复笔记");
      await fetchNotes(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setActingNoteId("");
    }
  }

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (query.failureStage && note.failure_error_stage !== query.failureStage) {
        return false;
      }
      if (query.retryable === "retryable" && note.failure_retryable !== true) {
        return false;
      }
      if (query.retryable === "non_retryable" && note.failure_retryable !== false) {
        return false;
      }
      return true;
    });
  }, [notes, query.failureStage, query.retryable]);

  const canRender = useMemo(() => Boolean(me?.is_admin), [me]);

  if (loading && notes.length === 0) {
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
            <CardTitle className="text-2xl">管理后台 · 笔记管理</CardTitle>
            <AdminTabs />
          </CardHeader>

          <CardContent className="space-y-4">
            <form className="grid gap-2 md:grid-cols-[1fr_180px_140px_140px_140px_160px_150px_auto]" onSubmit={onSearch}>
              <Input
                placeholder="按用户ID、标题、链接、心得搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Input
                placeholder="所属用户ID"
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
              />
              <select className={SELECT_CLASS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AdminStatusFilter)}>
                <option value="">全部状态</option>
                <option value="pending">待分析</option>
                <option value="running">分析中</option>
                <option value="succeeded">成功</option>
                <option value="failed">失败</option>
              </select>
              <select
                className={SELECT_CLASS}
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as AdminVisibilityFilter)}
              >
                <option value="">全部可见性</option>
                <option value="private">私有</option>
                <option value="public">公开</option>
              </select>
              <select className={SELECT_CLASS} value={deletedFilter} onChange={(e) => setDeletedFilter(e.target.value as AdminDeletedFilter)}>
                <option value="all">全部删除状态</option>
                <option value="active">未删除</option>
                <option value="deleted">已删除</option>
              </select>
              <select
                className={SELECT_CLASS}
                value={failureStageFilter}
                onChange={(e) => setFailureStageFilter(e.target.value as AdminFailureStageFilter)}
              >
                <option value="">全部失败阶段</option>
                <option value="content_fetch">正文抓取</option>
                <option value="llm_request">LLM 请求</option>
                <option value="llm_parse">LLM 解析</option>
                <option value="unknown">未知</option>
              </select>
              <select className={SELECT_CLASS} value={retryableFilter} onChange={(e) => setRetryableFilter(e.target.value as AdminRetryableFilter)}>
                <option value="all">全部重试建议</option>
                <option value="retryable">建议重试</option>
                <option value="non_retryable">建议先修复配置</option>
              </select>
              <Button type="submit">搜索</Button>
            </form>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1360px] border-collapse text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">笔记ID</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">所属用户</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">来源</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">状态</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">失败诊断</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">可见性</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">删除状态</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">更新时间</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map((note) => (
                    <tr key={note.id} className="odd:bg-white even:bg-muted/20">
                      <td className="border-b border-border px-3 py-2">{note.id}</td>
                      <td className="border-b border-border px-3 py-2">
                        {note.owner_user_id}
                        {note.owner_is_deleted ? "（用户已删除）" : ""}
                      </td>
                      <td className="border-b border-border px-3 py-2">
                        <div className="max-w-[420px] space-y-1">
                          <div className="font-medium text-foreground">{note.source_title || "(无标题)"}</div>
                          <a className="break-all text-primary underline-offset-4 hover:underline" href={note.source_url} target="_blank" rel="noreferrer">
                            {note.source_url}
                          </a>
                        </div>
                      </td>
                      <td className="border-b border-border px-3 py-2">
                        <AnalysisStatusBadge status={note.analysis_status} />
                      </td>
                      <td className="border-b border-border px-3 py-2">
                        {note.failure_error_message || note.analysis_error ? (
                          <div className="max-w-[360px] space-y-1 text-xs">
                            <div className="font-medium text-foreground">{note.failure_error_message || note.analysis_error}</div>
                            <div className="text-muted-foreground">
                              {note.failure_error_code ? `错误码 ${note.failure_error_code}` : "错误码 -"} · 阶段{" "}
                              {renderFailureStage(note.failure_error_stage)}
                            </div>
                            <div className="text-muted-foreground">
                              {note.failure_error_class || "异常类型 -"} ·{" "}
                              {note.failure_retryable === true ? "建议重试" : note.failure_retryable === false ? "建议先修复配置" : "重试建议未知"}
                              {note.failure_elapsed_ms != null ? ` · ${note.failure_elapsed_ms}ms` : ""}
                            </div>
                            {note.failure_analyzed_at && <div className="text-muted-foreground">{new Date(note.failure_analyzed_at).toLocaleString()}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="border-b border-border px-3 py-2">{note.visibility === "public" ? "公开" : "私有"}</td>
                      <td className="border-b border-border px-3 py-2">
                        {note.is_deleted ? `已删除${note.deleted_at ? `（${new Date(note.deleted_at).toLocaleString()}）` : ""}` : "未删除"}
                      </td>
                      <td className="border-b border-border px-3 py-2">{new Date(note.updated_at).toLocaleString()}</td>
                      <td className="border-b border-border px-3 py-2">
                        {!note.is_deleted && (
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => onDeleteNote(note.id)}
                            disabled={actingNoteId === note.id}
                          >
                            {actingNoteId === note.id ? "处理中..." : "删除"}
                          </Button>
                        )}
                        {note.is_deleted && (
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => onRestoreNote(note.id)}
                            disabled={actingNoteId === note.id || note.owner_is_deleted}
                          >
                            {actingNoteId === note.id ? "处理中..." : "恢复"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function renderFailureStage(stage: AdminFailureStageFilter | null): string {
  if (stage === "content_fetch") return "正文抓取";
  if (stage === "llm_request") return "LLM 请求";
  if (stage === "llm_parse") return "LLM 解析";
  if (stage === "unknown") return "未知";
  return "-";
}
