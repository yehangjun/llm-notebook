"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  const returnTo = searchParams.get("return_to");
  const notesActive = resolveNotesActive(pathname, returnTo);
  const feedActive = resolveFeedActive(pathname, returnTo);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = keyword.trim();
    if (!text) {
      router.push("/feed?scope=following");
      return;
    }
    router.push(`/feed?scope=following&keyword=${encodeURIComponent(text)}`);
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
              placeholder="搜索广场内容"
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
