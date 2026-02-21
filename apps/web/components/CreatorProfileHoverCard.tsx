"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { apiRequest } from "../lib/api";
import { CreatorProfile } from "../lib/feed";
import { cn } from "../lib/utils";

type CreatorKind = "user" | "source";

type CreatorProfileHoverCardProps = {
  creatorName: string;
  creatorKind: CreatorKind;
  creatorId: string;
  sourceDomain: string;
  following: boolean;
  disabled?: boolean;
  onToggleFollow: () => Promise<void>;
  className?: string;
};

const CLOSE_DELAY_MS = 220;

export default function CreatorProfileHoverCard({
  creatorName,
  creatorKind,
  creatorId,
  sourceDomain,
  following,
  disabled = false,
  onToggleFollow,
  className,
}: CreatorProfileHoverCardProps) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [loadError, setLoadError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileKey = `${creatorKind}:${creatorId}`;

  function clearCloseTimer() {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function openCard() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleCloseCard() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        clearCloseTimer();
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [],
  );

  useEffect(() => {
    clearCloseTimer();
    setOpen(false);
    setProfile(null);
    setLoadError("");
    setLoading(false);
  }, [profileKey]);

  useEffect(() => {
    if (!open) return;
    if (profile) return;
    void loadProfile();
  }, [open, profile]);

  async function loadProfile(force = false) {
    if (loading && !force) return;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      params.set("creator_kind", creatorKind);
      params.set("creator_id", creatorId);
      const data = await apiRequest<CreatorProfile>(`/feed/creators/profile?${params.toString()}`, {}, true);
      setProfile(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载创作者信息失败");
    } finally {
      setLoading(false);
    }
  }

  async function onClickFollow() {
    if ((profile && !profile.can_follow) || actioning) return;
    setActioning(true);
    setLoadError("");
    try {
      await onToggleFollow();
      await loadProfile(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "关注操作失败");
    } finally {
      setActioning(false);
    }
  }

  const resolvedProfile = profile;
  const displayName = resolvedProfile?.display_name || creatorName;
  const resolvedDomain = resolvedProfile?.source_domain || sourceDomain;
  const homepageUrl = resolvedProfile?.homepage_url || null;
  const resolvedFollowing = resolvedProfile?.following ?? following;
  const canFollow = resolvedProfile?.can_follow ?? true;

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={openCard}
      onMouseLeave={scheduleCloseCard}
    >
      <button
        type="button"
        className="inline-flex items-center text-sm text-foreground underline decoration-border underline-offset-4 hover:text-primary"
        onClick={() => {
          clearCloseTimer();
          setOpen((prev) => !prev);
        }}
      >
        {displayName}
      </button>
      {open && (
        <>
          <div className="absolute left-0 top-full z-20 h-2 w-72" />
          <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-md border border-border bg-white p-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="muted">{creatorKind === "user" ? "笔记创作者" : "聚合信息源"}</Badge>
              <span className="truncate text-xs text-muted-foreground">
                {creatorKind === "user" ? `ID: ${creatorId}` : `来源: ${creatorId}`}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{displayName}</p>
            <p className="mt-1 text-xs text-muted-foreground">{resolvedDomain}</p>
            {resolvedProfile && (
              <p className="mt-1 text-xs text-muted-foreground">
                {resolvedProfile.follower_count} 关注者 ·{" "}
                {resolvedProfile.content_count}
                {creatorKind === "user" ? " 公开笔记" : " 聚合条目"}
              </p>
            )}
            {homepageUrl && (
              <a
                className="mt-1 block truncate text-xs text-primary underline underline-offset-4"
                href={homepageUrl}
                target="_blank"
                rel="noreferrer"
              >
                {homepageUrl}
              </a>
            )}
            {loadError && <p className="mt-2 text-xs text-red-600">{loadError}</p>}
            {loading && <p className="mt-2 text-xs text-muted-foreground">加载中...</p>}
            <Button
              className="mt-3 w-full"
              variant={resolvedFollowing ? "secondary" : "default"}
              size="sm"
              type="button"
              disabled={disabled || actioning || loading || !canFollow}
              onClick={() => void onClickFollow()}
            >
              {!canFollow ? "不可关注" : resolvedFollowing ? "取消关注" : "关注"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
