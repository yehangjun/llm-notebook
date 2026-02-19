"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AUTH_CHANGED_EVENT, getStoredUser, UserPublic } from "../lib/auth";
import { buttonVariants } from "./ui/button";

export default function AdminEntry() {
  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);

  useEffect(() => {
    const syncUser = () => {
      setUser(getStoredUser());
    };

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
    };
  }, []);

  if (!user?.is_admin) {
    return null;
  }

  return (
    <button className={buttonVariants({ variant: "secondary", size: "sm" })} onClick={() => router.push("/admin")} aria-label="admin-entry">
      管理后台
    </button>
  );
}
