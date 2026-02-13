"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getStoredUser } from "../lib/auth";

export default function AdminEntry() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    setIsAdmin(Boolean(user?.is_admin));
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <button className="account-btn" onClick={() => router.push("/admin/users")} aria-label="admin-entry">
      管理系统
    </button>
  );
}
