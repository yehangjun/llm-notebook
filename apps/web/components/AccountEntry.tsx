"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getStoredUser } from "../lib/auth";

export default function AccountEntry() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState("登录/注册");

  useEffect(() => {
    setMounted(true);
    const user = getStoredUser();
    if (!user) {
      setLabel("登录/注册");
      return;
    }
    if (user.nickname && user.nickname !== user.user_id) {
      setLabel(user.nickname);
      return;
    }
    setLabel(user.user_id);
  }, []);

  const target = useMemo(() => {
    if (!mounted) return "/auth";
    return label === "登录/注册" ? "/auth" : "/profile";
  }, [label, mounted]);

  return (
    <button
      className="account-btn"
      onClick={() => router.push(target)}
      aria-label="account-entry"
    >
      {label}
    </button>
  );
}
