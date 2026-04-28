/**
 * Editor sandbox.
 *
 * Lets you load any pre-existing MP4 (either dropped into
 * `public/test-videos/` or hosted at a public URL) directly into the
 * VideoResultPanel so you can iterate on the editor without paying
 * for a Seedance generation each round.
 *
 * Two ways to load a video:
 *   1. Drop one or more MP4s into `public/test-videos/` — they show
 *      up in the picker on this page.
 *   2. Paste any public URL (FAL CDN, S3, etc.) into the URL field.
 *
 * Once a source is chosen, the page mounts the same VideoResultPanel
 * the main flow uses, set to `status="ready"`, so the "Edit this video"
 * toggle (and the EditPanel underneath it) work exactly the same way
 * they do after a real generation.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Header,
  Input,
  Select,
  Text,
  toast,
} from "@sarvam/tatva";
import {
  DEFAULT_INDIC_LANGUAGE,
  INDIC_LANGUAGES,
  type IndicLanguageCode,
} from "@/lib/constants";
import { fetchJson } from "@/app/hooks/useApi";
import { VideoResultPanel } from "@/app/components/VideoResultPanel";
import { formatBytes } from "@/lib/format-utils";

interface TestVideoEntry {
  name: string;
  url: string;
  bytes: number;
}

interface ListResponse {
  videos: TestVideoEntry[];
}

const LANGUAGE_OPTIONS = INDIC_LANGUAGES.map((l) => ({
  value: l.value,
  label: l.label,
}));

/** Turns a path like "/test-videos/foo.mp4" into an absolute URL. */
function toAbsoluteUrl(maybeRelative: string): string {
  if (typeof window === "undefined") return maybeRelative;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (maybeRelative.startsWith("/")) return `${window.location.origin}${maybeRelative}`;
  return `${window.location.origin}/${maybeRelative}`;
}

export default function TestEditorPage() {
  const [videos, setVideos] = useState<TestVideoEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [pickedFromList, setPickedFromList] = useState<string>("");
  const [pastedUrl, setPastedUrl] = useState<string>("");
  // Active video URL — once set, it's what the editor operates on.
  // We keep this separate from the picker / input so the user can
  // switch sources without losing the current edit session mid-flow.
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<IndicLanguageCode>(DEFAULT_INDIC_LANGUAGE);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await fetchJson<ListResponse>("/api/dev/test-videos");
      setVideos(data.videos);
      // Auto-pick the first file when the page first loads — saves a
      // click in the common "I just dropped one file in" flow.
      if (data.videos.length > 0 && !pickedFromList && !activeUrl) {
        setPickedFromList(data.videos[0].url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to list test videos.";
      toast.error(msg);
    } finally {
      setLoadingList(false);
    }
  }, [pickedFromList, activeUrl]);

  useEffect(() => {
    void refreshList();
    // Intentionally empty deps — only run on mount; refreshList is
    // re-invoked manually via the Refresh button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickerOptions = useMemo(
    () =>
      videos.map((v) => ({
        value: v.url,
        label: v.name,
        description: formatBytes(v.bytes),
      })),
    [videos],
  );

  const handleLoadFromPicker = useCallback(() => {
    if (!pickedFromList) {
      toast.error("Pick a file from the dropdown first.");
      return;
    }
    setActiveUrl(toAbsoluteUrl(pickedFromList));
  }, [pickedFromList]);

  const handleLoadFromUrl = useCallback(() => {
    const trimmed = pastedUrl.trim();
    if (!trimmed) {
      toast.error("Paste a URL first.");
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    setActiveUrl(trimmed);
  }, [pastedUrl]);

  const handleClear = useCallback(() => {
    setActiveUrl(null);
  }, []);

  // Each successful edit returns a fresh public URL — swap into
  // `activeUrl` so the next edit operates on the latest version
  // (mirrors how the main page chains edits).
  const handleVideoEdited = useCallback((newUrl: string) => {
    setActiveUrl(toAbsoluteUrl(newUrl));
  }, []);

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-tatva-surface-primary">
      <div className="border-b border-tatva-border-secondary bg-tatva-surface-secondary px-tatva-12 py-tatva-8">
        <Header
          type="main"
          left={{
            title: "Editor sandbox",
            subtitle:
              "Load any MP4 to test the temporal editor without generating from scratch",
          }}
        />
      </div>
      <main className="min-h-0 flex-1 overflow-auto px-tatva-12 py-tatva-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-tatva-12 rounded-tatva-lg bg-tatva-surface-secondary p-tatva-12 shadow-tatva-l1">
          <section className="flex flex-col gap-tatva-8">
            <Text variant="heading-sm">Pick a source video</Text>
            <Text variant="body-sm" tone="secondary">
              Drop MP4s into <code>public/test-videos/</code> and they&apos;ll appear in the dropdown below. You can also paste any publicly fetchable URL (FAL CDN, S3, etc.).
            </Text>

            <div className="flex flex-col gap-tatva-8 rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary p-tatva-12">
              <div className="flex items-end gap-tatva-8">
                <div className="flex-1">
                  <Select
                    label={`From public/test-videos/ (${videos.length} file${videos.length === 1 ? "" : "s"})`}
                    placeholder={loadingList ? "Loading…" : "Pick a file"}
                    options={pickerOptions}
                    value={pickedFromList}
                    onValueChange={(v) => setPickedFromList(v)}
                    disabled={loadingList || pickerOptions.length === 0}
                    searchable
                  />
                </div>
                <Button
                  variant="secondary"
                  icon="refresh"
                  onClick={() => void refreshList()}
                  disabled={loadingList}
                >
                  Refresh
                </Button>
                <Button
                  variant="primary"
                  onClick={handleLoadFromPicker}
                  disabled={!pickedFromList}
                >
                  Load
                </Button>
              </div>

              <div className="flex items-end gap-tatva-8">
                <div className="flex-1">
                  <Input
                    label="…or paste a URL"
                    placeholder="https://example.com/video.mp4"
                    value={pastedUrl}
                    onChange={(e) => setPastedUrl(e.target.value)}
                  />
                </div>
                <Button variant="primary" onClick={handleLoadFromUrl}>
                  Load
                </Button>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-tatva-8">
            <Text variant="heading-sm">Generation language</Text>
            <Text variant="body-sm" tone="secondary">
              Forwarded to the prompt optimiser and pre-selected as the Bulbul language. Pretend this is the language the loaded video was originally generated in.
            </Text>
            <div className="max-w-xs">
              <Select
                label="Language"
                options={LANGUAGE_OPTIONS}
                value={language}
                onValueChange={(v) => setLanguage(v as IndicLanguageCode)}
                searchable
              />
            </div>
          </section>

          <section className="flex flex-col gap-tatva-8">
            <div className="flex items-center justify-between">
              <Text variant="heading-sm">Editor</Text>
              {activeUrl && (
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
            <div className="rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary">
              {activeUrl ? (
                <VideoResultPanel
                  status="ready"
                  videoUrl={activeUrl}
                  seed={null}
                  generationLanguage={language}
                  onReset={handleClear}
                  onVideoEdited={handleVideoEdited}
                />
              ) : (
                <div className="p-tatva-24">
                  <EmptyState
                    heading="No video loaded"
                    body="Pick a file from the dropdown or paste a URL above, then hit Load to start testing the editor."
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
