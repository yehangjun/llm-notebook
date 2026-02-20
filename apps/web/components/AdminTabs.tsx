"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "./ui/button";
import { cn } from "../lib/utils";

const ADMIN_TABS = [
  { href: "/admin/users", label: "用户" },
  { href: "/admin/notes", label: "笔记" },
  { href: "/admin/sources", label: "聚合源" },
  { href: "/admin/aggregates", label: "聚合条目" },
];

export default function AdminTabs() {
  const pathname = usePathname() || "";

  return (
    <div className="flex flex-wrap gap-2" aria-label="admin-modules-tabs">
      {ADMIN_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              buttonVariants({
                variant: active ? "default" : "ghost",
                size: "sm",
              }),
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
