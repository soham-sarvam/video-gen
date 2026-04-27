# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Purpose

Indic AI video pipeline — turns any input (PDF, brief, reference assets) into a 1-minute, Indic-dubbed, consistent-character video. Core engine is **Seedance 2.0** for video generation, **Sarvam Bulbul v3** for Indic TTS, and **FFmpeg** for multi-clip stitching. See `seedance_indic_video_roadmap.md` for full architecture and `fal-seedance-api.md` for the FAL API schema.

## Commands

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build + tatva-usage audit
npm run lint     # ESLint
npm start        # Start production server
```

**IMPORTANT**: Before writing any Next.js code, read `node_modules/next/dist/docs/` — this project uses Next.js 16 which has breaking API changes.

## Architecture

Single Next.js 16 App Router project. No separate backend service yet — all logic lives in route handlers and server actions.

- `app/` — pages, layouts, API routes (App Router)
- `app/globals.css` — global styles with Tailwind v4
- Dependencies: `@sarvam/tatva` (design system), `motion` (animations), `next`, `react`

**Environment variables** (`.env`):
- `FAL_API_KEY` — FAL.ai API key for Seedance 2.0
- `GEMINI_API_KEY` — Gemini API for script/shotlist generation

## Tatva MCP (CRITICAL — Use Before Every Component)

The `tatva` MCP is configured in `.mcp.json`. **Always call it before implementing any Tatva component.**

1. `list-all-documentation` — discover all available components
2. `get-documentation <componentId>` — get props, variants, usage examples
3. `get-documentation-for-story <storyId>` — get specific story/variant details

**Never assume or guess Tatva props — retrieve docs first.**

## Design System: @sarvam/tatva

### Non-negotiable rules

- **Import ONLY from `@sarvam/tatva`** — never build custom components
- **No `className` on Tatva components** — wrap in a `<div>` if you need custom styling
- **All spacing uses `tatva-` prefix**: `p-tatva-8`, `gap-tatva-12`, `rounded-tatva-lg`, `shadow-tatva-l1`, `h-svh` (never `h-screen`)
- **All colors**: `bg-tatva-surface-secondary`, `text-tatva-*`, `border-tatva-border`

### Component quick-reference

| Need | Component | Critical props |
|---|---|---|
| Tabular data | `Table` | `id` + `accessorKey` (NOT `key`) |
| Tabs | `Tabs` | `tabs` prop, `onValueChange` (NOT `onChange`) |
| Dropdown | `Select` | `onValueChange` (NOT `onChange`) |
| Toast | `toast` from `@sarvam/tatva` | `toast.success()` (not a hook) |
| Page header | `Header` | `type="main"/"panel"/"canvas"`, max 2 CTAs |
| Quick confirm | `Dialog` | No extra padding inside content |
| Detail panel | `Sheet` | No extra padding inside content |
| Status | `Badge` | Static; `Tag` = selectable; `Chip` = removable |

### Layout shell pattern

```tsx
// Outer: bg-tatva-surface-primary
// Content: bg-tatva-surface-secondary shadow-tatva-l1 rounded-tatva-lg
// Only <main> scrolls; outer shell: overflow-hidden
// Flex children that scroll need min-h-0
```

### Required states for every data page

Loading → `<Skeleton>` · Empty → `<EmptyState>` with action · Error → message + retry · Success → content or toast

### Root layout providers

```tsx
<TooltipProvider>
  {children}
  <Toaster position="bottom-right" />
</TooltipProvider>
```

## Available Skills

Invoke via the `Skill` tool. Key skills for this project:

| Skill | When to use |
|---|---|
| `sarvam-frontend` | Any Tatva/Next.js UI work — full component guide + MCP workflow |
| `design-taste-frontend` | Aesthetic direction, visual polish |
| `emil-design-eng` | Precision design engineering |
| `animate` | Motion design with `motion` library |
| `web-design-guidelines` | Audit UI against Web Interface Guidelines |
| `web-design-reviewer` | Review UI quality |
| `high-end-visual-design` | Premium visual direction |

Cursor rules (always applied): `.cursor/rules/golden-rules.mdc`, `.cursor/rules/design-system.mdc`, `.cursor/rules/project-standards.mdc`.

## Seedance 2.0 — Key Pipeline Facts

Three mutually exclusive API modes (see roadmap §2.2):
- **Text-to-Video**: `prompt` only
- **Image-to-Video**: `prompt + first_frame_url` (+ optional `last_frame_url`)
- **Multimodal Reference**: `prompt + reference_image_urls/reference_video_urls/reference_audio_urls`

**Hard asset limits to validate before every call:**
- ≤ 9 reference images, ≤ 30 MB each
- ≤ 3 reference videos, ≤ 50 MB each, 2–15s
- ≤ 3 reference audio, ≤ 15 MB each, ≤ 15s
- Duration 4–15s per clip

**Every uploaded asset must be `@`-referenced in the prompt with a role word** (`as the`, `references`, `reference`, `using the`). Validate this before every API call.

**Always set `generate_audio: false`** — use Bulbul v3 for Indic dialogue; `return_last_frame: true` for shot-to-shot continuity.

**Rate limits**: 2 req/s, 3 concurrent jobs. Use async pattern: submit → `taskId` → callback URL (not polling).

**FAL endpoint** (hackathon): `bytedance/seedance-2.0/fast/image-to-video` — see `fal-seedance-api.md`.

## File Organization

```
app/(private)/feature-name/
  ├── page.tsx         # Main page (server component by default)
  ├── constants.ts     # SCREAMING_SNAKE_CASE constants
  ├── components/      # Feature-specific components (PascalCase)
  └── hooks/           # Feature hooks (use-prefix camelCase)
```

Root `components/` only for things shared across 3+ features.

## TypeScript Conventions

- `interface` for object shapes; `type` for unions/utility types
- `string literal unions` over `enum` (this project; differs from other Sarvam projects)
- No `any` — use `unknown` + narrowing for external data
- Props must have explicit named interfaces
- Immutable updates — spread operator, never mutate in place
