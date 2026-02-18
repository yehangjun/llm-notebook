"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_TABS = [
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/notes", label: "笔记管理" },
  { href: "/admin/sources", label: "聚合管理" },
];

export default function AdminTabs() {
  const pathname = usePathname() || "";

  return (
    <div className="tabs" aria-label="admin-modules-tabs">
      {ADMIN_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={active ? "tab active" : "tab"}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

