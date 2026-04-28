# Story Mode E2E smoke checklist

Run with the dev server up and `KIE_API_KEY` / `FAL_API_KEY` /
`GEMINI_API_KEY` / `BULBUL_TTS_API_KEY` all populated in `.env`.

## Quality mode (60s, KIE Fast)

1. Navigate http://localhost:3000.
2. Theme: **Cinematic**. Story length: **Minute story**. Mode: **Quality**.
3. Model: **KIE · Bytedance Seedance 2.0 — Fast**. Language: **Hindi**.
4. Upload `clip_004.mp4` + `clip_004.mp3` (or any non-face references). Skip image if you don't have a character ref handy.
5. Prompt: "A slice-of-life vignette of a Mumbai morning."
6. Click **Plan story**. Verify the outline shows ~4 beats with durations summing to 60 ±1s and dialogue beats end on terminal punctuation.
7. Click **Generate 4 clips**. Watch the BeatProgressCard transitions:
   - beat 1 queued → running → completed
   - beat 2 queued (waiting on beat 1) → running → completed
   - beat 3 same; beat 4 same.
8. After all complete, the timeline auto-stitches and shows `final.mp4`.
9. Verify:
   - final.mp4 plays
   - dialogue has reasonable lip-sync per language
   - no jarring cuts mid-sentence
   - final length ~60s ± 2s

## Fast mode (30s, KIE Fast)

1. Same setup; storyLength: **Half-minute**, mode: **Fast**.
2. After **Plan story** the outline shows 2 beats with `fullPrompt` populated.
3. Hit **Generate**. Both beats run concurrently — wall time ~60–90s.
4. Final video plays; cuts are visibly hard (intended in Fast mode).

## Provider fallback (FAL)

1. Same as Quality test but model = **FAL · Reference to Video — Fast**.
2. Verify continuation beats use image-to-video routing — check the Next.js dev terminal for FAL endpoint URLs containing `bytedance/seedance-2.0/fast/image-to-video` for beats 2+.
3. Beat 1 should use `bytedance/seedance-2.0/fast/reference-to-video` since it's an opener (no `firstFrameUrl`).

## Re-roll (V1 deferred)

Per the design spec, per-beat re-roll is deferred to V2. The button currently shows a toast informing the user. Verify the toast appears on click and no other behavior fires.

## Archive verification

After a successful run, confirm filesystem layout:

```
public/uploads/generations/<provider>/story-<storyId>/
  ├── shotlist.json
  ├── metadata.json
  ├── voice-timbre.{wav,mp3}      (or referenced via voice-cache)
  ├── final.mp4
  ├── beat-1/{video.mp4, prompt.txt, metadata.json}
  ├── beat-2/...
  └── beat-N/...
```

Open `metadata.json` in each beat dir; verify `tier`, `taskId`, `archivedAt` match what was generated.

## Failure-mode smoke

1. Kill the dev server while a Quality-mode story is mid-flight (after beat 1 starts).
2. Restart `npm run dev`.
3. Hit **Generate** on the same outline. Confirm the system either resumes from saved state or fails cleanly with a status page-readable error — depending on V1 behavior. (Per V1 scope, persistence-resume is "best effort" via `state.json`; full crash recovery is V2.)
