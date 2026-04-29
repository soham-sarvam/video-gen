"use client";

import { useCallback, useState } from "react";
import { Header } from "@sarvam/tatva";
import type { StorySummary } from "@/app/api/story/list/route";
import { GenerationForm } from "./components/GenerationForm";
import { StorySidebar } from "./components/StorySidebar";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState<StorySummary | null>(null);

  const handleSelectStory = useCallback((summary: StorySummary) => {
    setSelectedStory(summary);
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-tatva-surface-primary">
      <StorySidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onSelectStory={handleSelectStory}
        activeStoryId={selectedStory?.storyId}
      />
      <div className="border-b border-tatva-border-secondary bg-tatva-surface-secondary px-tatva-12 py-tatva-8">
        <Header
          type="main"
          left={{
            title: "Indic Video Studio",
            subtitle:
              "Seedance 2.0 reference-to-video · Gemini-tuned Indic prompts · Lipsync-ready audio",
          }}
        />
      </div>
      <main className="min-h-0 flex-1 overflow-auto px-tatva-12 py-tatva-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-tatva-12 rounded-tatva-lg bg-tatva-surface-secondary p-tatva-12 shadow-tatva-l1">
          <GenerationForm
            preloadStory={selectedStory}
            onStoryLoaded={() => setSelectedStory(null)}
          />
        </div>
      </main>
    </div>
  );
}
