import { Header } from "@sarvam/tatva";
import { GenerationForm } from "./components/GenerationForm";

export default function Home() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-tatva-surface-primary">
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
          <GenerationForm />
        </div>
      </main>
    </div>
  );
}
