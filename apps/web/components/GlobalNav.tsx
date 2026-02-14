"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import AccountEntry from "./AccountEntry";
import AdminEntry from "./AdminEntry";

export default function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");

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
    <header className="nav-shell">
      <nav className="nav container">
        <div className="nav-left">
          <Link className="nav-brand" href="/">
            <span className="brand-mark">P</span>
            <span className="brand-text">Prism</span>
          </Link>
          <form className="nav-search" onSubmit={onSearch}>
            <input
              aria-label="全局搜索"
              placeholder="搜索广场内容"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </form>
        </div>

        <div className="nav-links" aria-label="global-navigation">
          <Link className={pathname?.startsWith("/notes") ? "nav-link active" : "nav-link"} href="/notes">
            笔记
          </Link>
          <Link className={pathname?.startsWith("/feed") ? "nav-link active" : "nav-link"} href="/feed">
            广场
          </Link>
        </div>

        <div className="nav-actions">
          <button className="icon-btn" type="button" aria-label="write-note" onClick={() => router.push("/notes/new")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button className="icon-btn" type="button" aria-label="notifications" onClick={() => router.push("/notifications")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          <AdminEntry />
          <AccountEntry />
        </div>
      </nav>
    </header>
  );
}
