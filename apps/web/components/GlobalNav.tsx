"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import AccountEntry from "./AccountEntry";
import AdminEntry from "./AdminEntry";

export default function GlobalNav() {
  const pathname = usePathname();

  return (
    <header className="nav-shell">
      <nav className="nav container">
        <Link className="nav-brand" href="/">
          <span className="brand-mark">P</span>
          <span className="brand-text">Prism</span>
        </Link>

        <div className="nav-links" aria-label="global-navigation">
          <Link className={pathname === "/" ? "nav-link active" : "nav-link"} href="/">
            首页
          </Link>
          <Link className={pathname?.startsWith("/notes") ? "nav-link active" : "nav-link"} href="/notes">
            笔记
          </Link>
          <a className="nav-link" href="/#discover">
            Discover
          </a>
          <a className="nav-link" href="/#about">
            About
          </a>
        </div>

        <div className="nav-actions">
          <AdminEntry />
          <AccountEntry />
        </div>
      </nav>
    </header>
  );
}
