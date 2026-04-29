"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Skeleton, Text } from "@sarvam/tatva";
import type { StorySummary } from "@/app/api/story/list/route";
import { fetchJson } from "@/app/hooks/useApi";

interface StorySidebarProps {
  open: boolean;
  onToggle: () => void;
  onSelectStory: (summary: StorySummary) => void;
  /** storyId of the currently loaded story, to highlight in the list */
  activeStoryId?: string | null;
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
  if (s.stitchStatus === "completed")
    return { label: "Done", cls: "bg-green-500/15 text-green-600" };
  if (s.stitchStatus === "failed")
    return { label: "Failed", cls: "bg-red-500/15 text-red-600" };
  if (s.stitchStatus === "stitching")
    return { label: "Stitching", cls: "bg-amber-500/15 text-amber-600" };
  if (s.completedBeats === s.beatCount)
    return { label: "Ready", cls: "bg-blue-500/15 text-blue-600" };
  if (s.completedBeats > 0)
    return {
      label: `${s.completedBeats}/${s.beatCount}`,
      cls: "bg-amber-500/15 text-amber-600",
    };
  return { label: "Queued", cls: "bg-neutral-500/15 text-neutral-500" };
}

export function StorySidebar({
  open,
  onToggle,
  onSelectStory,
  activeStoryId,
}: StorySidebarProps) {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewStoryId, setPreviewStoryId] = useState<string | null>(null);

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
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
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
              const isActive = activeStoryId === s.storyId;
              return (
                <div
                  key={`${s.provider}-${s.storyId}`}
                  className={[
                    "flex flex-col gap-tatva-2 border-b border-tatva-border-secondary px-tatva-8 py-tatva-8 transition-colors",
                    isActive ? "bg-tatva-surface-primary" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStory(s)}
                    className="flex flex-col gap-tatva-2 text-left hover:opacity-80"
                  >
                    <div className="flex items-center justify-between gap-tatva-4">
                      <Text variant="label-sm" lineClamp={1}>
                        {s.storyId}
                      </Text>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-tatva-4">
                      <Text variant="body-xs" tone="tertiary">
                        {s.provider.toUpperCase()} · {s.mode} · {s.beatCount}{" "}
                        beats · {s.totalDurationSeconds}s
                      </Text>
                    </div>
                    <Text variant="body-xs" tone="tertiary">
                      {s.stylePackId} · {formatTime(s.createdAt)}
                    </Text>
                  </button>
                  {((s.characterProfiles?.length ?? 0) > 0 ||
                    s.characterSheetUrl) && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewStoryId(
                          previewStoryId === s.storyId ? null : s.storyId,
                        )
                      }
                      className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <span>
                        {previewStoryId === s.storyId ? "Hide" : "View"}{" "}
                        {(s.characterProfiles?.length ?? 0) > 1
                          ? `${s.characterProfiles!.length} characters`
                          : "character sheet"}
                      </span>
                    </button>
                  )}
                  {previewStoryId === s.storyId && (
                    <div className="mt-2 flex flex-col gap-2">
                      {(s.characterProfiles?.length ?? 0) > 0 ? (
                        s.characterProfiles!.map((cp) => (
                          <div key={cp.id} className="flex flex-col gap-1">
                            <Text variant="label-sm">{cp.name}</Text>
                            {cp.sheetUrl && (
                              <img
                                src={cp.sheetUrl}
                                alt={`Sheet for ${cp.name}`}
                                className="w-full rounded-tatva-sm border border-tatva-border-secondary"
                              />
                            )}
                          </div>
                        ))
                      ) : s.characterSheetUrl ? (
                        <img
                          src={s.characterSheetUrl}
                          alt={`Character sheet for ${s.storyId}`}
                          className="w-full rounded-tatva-sm border border-tatva-border-secondary"
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
