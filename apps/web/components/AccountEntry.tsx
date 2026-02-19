"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AUTH_CHANGED_EVENT, getStoredUser, UserPublic } from "../lib/auth";
import { buttonVariants } from "./ui/button";
import { cn } from "../lib/utils";

export default function AccountEntry() {
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

  const label = useMemo(() => {
    if (!user) return "登录/注册";
    if (user.nickname && user.nickname !== user.user_id) {
      return user.nickname;
    }
    return user.user_id;
  }, [user]);
  const target = user ? "/profile" : "/auth";

  return (
    <button
      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "max-w-[180px] truncate")}
      onClick={() => router.push(target)}
      aria-label="account-entry"
    >
      {label}
    </button>
  );
}
