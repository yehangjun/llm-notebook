"use client";

import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type InteractionKind = "bookmark" | "like";

type InteractionCountButtonProps = {
  kind: InteractionKind;
  count: number;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
};

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4", active ? "fill-current" : "fill-none")}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M6.75 4.75h10.5a1 1 0 0 1 1 1v13.5l-6.25-3.8-6.25 3.8V5.75a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function LikeIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4", active ? "fill-current" : "fill-none")}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M12 20.4 4.6 13.7a4.9 4.9 0 0 1 6.9-6.9L12 7.3l.5-.5a4.9 4.9 0 0 1 6.9 6.9L12 20.4z" />
    </svg>
  );
}

function StatInner({ kind, count, active }: { kind: InteractionKind; count: number; active: boolean }) {
  return (
    <>
      {kind === "bookmark" ? <BookmarkIcon active={active} /> : <LikeIcon active={active} />}
      <span className="min-w-4 text-center tabular-nums">{count}</span>
    </>
  );
}

export default function InteractionCountButton({
  kind,
  count,
  active,
  disabled,
  onClick,
  className,
}: InteractionCountButtonProps) {
  if (!onClick) {
    return (
      <span
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-sm text-foreground",
          className,
        )}
      >
        <StatInner kind={kind} count={count} active={active} />
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "secondary"}
      disabled={disabled}
      onClick={onClick}
      className={cn("gap-1.5 px-2.5", className)}
    >
      <StatInner kind={kind} count={count} active={active} />
    </Button>
  );
}
