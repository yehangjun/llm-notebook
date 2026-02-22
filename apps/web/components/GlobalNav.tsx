"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";

import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import AccountEntry from "./AccountEntry";
import AdminEntry from "./AdminEntry";
import { cn } from "../lib/utils";

export default function GlobalNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const returnTo = searchParams.get("return_to");
  const searchParamString = searchParams.toString();
  const notesActive = resolveNotesActive(pathname, returnTo);
  const feedActive = resolveFeedActive(pathname, returnTo);
  const searchContext = resolveSearchContext(pathname, returnTo, searchParams);
  const currentKeyword = (searchContext.params.get("keyword") || "").trim();

  useEffect(() => {
    setKeyword(currentKeyword);
  }, [currentKeyword, searchContext.kind]);

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname, searchParamString]);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = keyword.trim();
    router.push(buildSearchTarget(searchContext, text));
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur">
      <nav className="relative mx-auto flex h-[68px] w-full max-w-[1080px] items-center gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link className="inline-flex items-center gap-2" href="/">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 text-sm font-semibold text-blue-700">
              P
            </span>
            <span className="text-lg font-semibold tracking-tight">Prism</span>
          </Link>
          <form className="hidden w-full max-w-[320px] md:block" onSubmit={onSearch}>
            <Input
              aria-label="全局搜索"
              placeholder={searchContext.kind === "notes" ? "搜索我的笔记" : "搜索广场内容"}
              className="h-9 rounded-full bg-white/90"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </form>
          <div className="flex items-center gap-1 md:hidden">
            <Link
              className={cn(
                buttonVariants({
                  variant: notesActive ? "default" : "ghost",
                  size: "sm",
                }),
              )}
              href="/notes"
            >
              笔记
            </Link>
            <Link
              className={cn(
                buttonVariants({
                  variant: feedActive ? "default" : "ghost",
                  size: "sm",
                }),
              )}
              href="/feed"
            >
              广场
            </Link>
          </div>
        </div>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex" aria-label="global-navigation">
          <Link
            className={cn(
              buttonVariants({
                variant: notesActive ? "default" : "ghost",
                size: "sm",
              }),
            )}
            href="/notes"
          >
            笔记
          </Link>
          <Link
            className={cn(
              buttonVariants({
                variant: feedActive ? "default" : "ghost",
                size: "sm",
              }),
            )}
            href="/feed"
          >
            广场
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <Button
            className="md:hidden"
            variant="secondary"
            size="icon"
            type="button"
            aria-label="mobile-search"
            onClick={() => setMobileSearchOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Button>
          <Button variant="secondary" size="icon" type="button" aria-label="write-note" onClick={() => router.push("/notes/new")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </Button>
          <Button variant="secondary" size="icon" type="button" aria-label="notifications" onClick={() => router.push("/notifications")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </Button>
          <AdminEntry />
          <AccountEntry />
        </div>
      </nav>
      {mobileSearchOpen && (
        <div className="border-t border-border/70 bg-background/95 px-4 pb-3 pt-2 md:hidden">
          <div className="mx-auto w-full max-w-[1080px]">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                onSearch(e);
                setMobileSearchOpen(false);
              }}
            >
              <Input
                aria-label="移动端全局搜索"
                placeholder={searchContext.kind === "notes" ? "搜索我的笔记" : "搜索广场内容"}
                className="h-9 rounded-full bg-white/90"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                autoFocus
              />
              <Button variant="secondary" size="sm" type="submit">
                搜索
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setMobileSearchOpen(false)}>
                取消
              </Button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}

function resolveNotesActive(pathname: string | null, returnTo: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/notes")) return true;
  if (pathname.startsWith("/feed/items") && returnTo?.startsWith("/notes")) return true;
  return false;
}

function resolveFeedActive(pathname: string | null, returnTo: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/feed/items") && returnTo?.startsWith("/notes")) return false;
  return pathname.startsWith("/feed");
}

type SearchContextKind = "feed" | "notes";

type SearchContext = {
  kind: SearchContextKind;
  params: URLSearchParams;
};

function resolveSearchContext(
  pathname: string | null,
  returnTo: string | null,
  currentSearchParams: ReadonlyURLSearchParams,
): SearchContext {
  if (!pathname) {
    return {
      kind: "feed",
      params: new URLSearchParams(),
    };
  }

  if (pathname.startsWith("/feed/items")) {
    const returnContext = parseReturnContext(returnTo);
    if (returnContext) return returnContext;
  }

  if (pathname.startsWith("/feed")) {
    return {
      kind: "feed",
      params: new URLSearchParams(currentSearchParams.toString()),
    };
  }

  if (pathname.startsWith("/notes")) {
    return {
      kind: "notes",
      params: new URLSearchParams(currentSearchParams.toString()),
    };
  }

  const returnContext = parseReturnContext(returnTo);
  if (returnContext) return returnContext;

  return {
    kind: "feed",
    params: new URLSearchParams(),
  };
}

function parseReturnContext(returnTo: string | null): SearchContext | null {
  const parsed = parseRelativeUrl(returnTo);
  if (!parsed) return null;
  if (parsed.pathname.startsWith("/feed")) {
    return { kind: "feed", params: parsed.params };
  }
  if (parsed.pathname.startsWith("/notes")) {
    return { kind: "notes", params: parsed.params };
  }
  return null;
}

function parseRelativeUrl(raw: string | null): { pathname: string; params: URLSearchParams } | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "http://localhost");
    if (!parsed.pathname.startsWith("/")) return null;
    return {
      pathname: parsed.pathname,
      params: new URLSearchParams(parsed.searchParams.toString()),
    };
  } catch {
    return null;
  }
}

function buildSearchTarget(context: SearchContext, keyword: string): string {
  if (context.kind === "notes") {
    return buildNotesSearchTarget(context.params, keyword);
  }
  return buildFeedSearchTarget(context.params, keyword);
}

function buildFeedSearchTarget(sourceParams: URLSearchParams, keyword: string): string {
  const params = new URLSearchParams();
  params.set("scope", parseFeedScope(sourceParams.get("scope")));
  const tag = normalizeTagFilter(sourceParams.get("tag"));
  if (tag) params.set("tag", tag);
  if (keyword) params.set("keyword", keyword);
  return `/feed?${params.toString()}`;
}

function buildNotesSearchTarget(sourceParams: URLSearchParams, keyword: string): string {
  const params = new URLSearchParams();
  params.set("tab", "notes");
  const status = parseNotesStatus(sourceParams.get("status"));
  const visibility = parseNotesVisibility(sourceParams.get("visibility"));
  const tag = normalizeTagFilter(sourceParams.get("tag"));
  if (status) params.set("status", status);
  if (visibility) params.set("visibility", visibility);
  if (tag) params.set("tag", tag);
  if (keyword) params.set("keyword", keyword);
  return `/notes?${params.toString()}`;
}

function parseFeedScope(raw: string | null): "following" | "unfollowed" {
  if (raw === "unfollowed") return "unfollowed";
  return "following";
}

function parseNotesStatus(raw: string | null): "" | "pending" | "running" | "succeeded" | "failed" {
  if (raw === "pending") return "pending";
  if (raw === "running") return "running";
  if (raw === "succeeded") return "succeeded";
  if (raw === "failed") return "failed";
  return "";
}

function parseNotesVisibility(raw: string | null): "" | "private" | "public" {
  if (raw === "private") return "private";
  if (raw === "public") return "public";
  return "";
}

function normalizeTagFilter(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^#+/, "").toLowerCase();
}
