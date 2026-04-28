"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Skeleton, Text } from "@sarvam/tatva";
import type { StorySummary } from "@/app/api/story/list/route";
import { fetchJson } from "@/app/hooks/useApi";

interface StorySidebarProps {
  open: boolean;
  onToggle: () => void;
  onSelectStory: (summary: StorySummary) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusBadge(s: StorySummary) {
  if (s.stitchStatus === "completed") return { label: "Done", cls: "bg-green-500/15 text-green-600" };
  if (s.stitchStatus === "failed") return { label: "Failed", cls: "bg-red-500/15 text-red-600" };
  if (s.stitchStatus === "stitching") return { label: "Stitching", cls: "bg-amber-500/15 text-amber-600" };
  if (s.completedBeats === s.beatCount) return { label: "Ready", cls: "bg-blue-500/15 text-blue-600" };
  if (s.completedBeats > 0) return { label: `${s.completedBeats}/${s.beatCount}`, cls: "bg-amber-500/15 text-amber-600" };
  return { label: "Queued", cls: "bg-neutral-500/15 text-neutral-500" };
}

export function StorySidebar({ open, onToggle, onSelectStory }: StorySidebarProps) {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<StorySummary[]>("/api/story/list");
      setStories(data);
    } catch {
      // silent — sidebar is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  return (
    <>
      {/* Toggle tab on the left edge */}
      <button
        type="button"
        onClick={onToggle}
        className="fixed left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-tatva-md border border-l-0 border-tatva-border-secondary bg-tatva-surface-secondary px-1.5 py-6 shadow-tatva-l1 transition-opacity hover:bg-tatva-surface-primary"
        aria-label={open ? "Close story sidebar" : "Open story sidebar"}
      >
        <span className="block text-xs font-medium [writing-mode:vertical-lr] rotate-180 select-none text-tatva-text-secondary">
          Stories
        </span>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={onToggle}
          onKeyDown={(e) => e.key === "Escape" && onToggle()}
          role="button"
          tabIndex={-1}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          "fixed left-0 top-0 z-40 flex h-svh w-80 flex-col border-r border-tatva-border-secondary bg-tatva-surface-secondary shadow-tatva-l2 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-tatva-border-secondary px-tatva-8 py-tatva-8">
          <Text variant="heading-xs">Past Stories</Text>
          <div className="flex gap-tatva-4">
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggle}>
              Close
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && stories.length === 0 && (
            <div className="flex flex-col gap-tatva-4 p-tatva-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={64} />
              ))}
            </div>
          )}

          {!loading && stories.length === 0 && (
            <div className="flex h-full items-center justify-center p-tatva-12">
              <Text variant="body-sm" tone="secondary">
                No stories yet. Generate your first story above.
              </Text>
            </div>
          )}

          <div className="flex flex-col">
            {stories.map((s) => {
              const badge = statusBadge(s);
              return (
                <button
                  key={`${s.provider}-${s.storyId}`}
                  type="button"
                  onClick={() => onSelectStory(s)}
                  className="flex flex-col gap-tatva-2 border-b border-tatva-border-secondary px-tatva-8 py-tatva-8 text-left transition-colors hover:bg-tatva-surface-primary"
                >
                  <div className="flex items-center justify-between gap-tatva-4">
                    <Text variant="label-sm" lineClamp={1}>
                      {s.storyId}
                    </Text>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-tatva-4">
                    <Text variant="body-xs" tone="tertiary">
                      {s.provider.toUpperCase()} · {s.mode} · {s.beatCount} beats · {s.totalDurationSeconds}s
                    </Text>
                  </div>
                  <Text variant="body-xs" tone="tertiary">
                    {s.stylePackId} · {formatTime(s.createdAt)}
                  </Text>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
