# Seedance 2.0 × Sarvam — Indic AI Video Pipeline

**Hackathon-first, production-graded roadmap**
Owner: Soham · Team: Jayesh, Samarth, Katie, Soham (+ Neeraj?) · Date: 24 Apr 2026

---

## TL;DR

Build a pipeline that turns **any input (PDF, brief, upload bundle) into a 1-minute, Indic-dubbed, consistent-character video** — where the user can mix-and-match text prompts with **reference images, reference videos, and reference audio**. Use Seedance 2.0's Multimodal Reference-to-Video mode as the core; wrap it with GPT-Image-2 (first/last frames), Bulbul v3 (Indic voices), ElevenLabs SFX + Stable Audio (bed), and an FFmpeg + RIFE stitcher.

Hackathon goal (win iPad/PS5): **ship a demo in a week** that does something no global player does well — a 60-second Indic reel with a consistent character, real Indic dialogue, uploaded-reference-driven camera/style, and smooth multi-shot stitching.

Production goal (12–18 months): **₹10Cr+ ARR from OTT dubbing, edtech long-form, and govt/BFSI sovereign deployments** — Sarvam owns the Indic layer; Seedance/Kling/Veo are interchangeable pixel backends.

The defensible moat is not frame quality. It is **Indic dialogue, Indic-accurate characters, sovereign deployment, and the orchestration layer** — all of which Sarvam's existing stack (Bulbul, Saaras, Shuka, Mayura) compounds on.

---

## 1. What we're actually building

### 1.1 The product hypothesis

One-line: **"Upload anything — get a 60-second Indic video back."**

Input modalities we support:
- A PDF, script, or topic ("explain photosynthesis in Hindi to a 10-year-old")
- A character reference image (1–9 images for appearance lock)
- A scene/environment reference image
- A reference video for camera style or action choreography
- A reference audio clip for BGM or voice tone
- A script in any of 11 Indic languages, or an audio file to dub from

Output:
- A 1080p, ~60s MP4
- Consistent hero character across 6–10 shots
- Native Indic dialogue + BGM + SFX
- Downloadable, commercial-use licensed

This maps exactly to Seedance 2.0's **Multimodal Reference-to-Video** mode (the `@image1…@image9 + @video1…@video3 + @audio1…@audio3` schema) — which is the feature no other frontier model exposes this cleanly.

### 1.2 Why this wins the hackathon

The other likely hackathon pitches will be "ChatGPT wrapper on top of Seedance" or "Canva-style template generator." Ours is:

1. **Multimodal reference combining** — upload an image, a video, and an audio sample, and we route each to the right role via structured prompts. Judges will not have seen this before.
2. **Indic-first** — every other demo will be English. Ours opens with a Tamil voiceover from Bulbul v3 and on-screen Devanagari that renders cleanly because we composite text in post (Seedance hates non-Latin glyphs).
3. **Consistent character across shots** — 60-second videos fail because shot-to-shot the character's face drifts. Our first-frame/last-frame handoff with a GPT-Image-2 character sheet is the trick.
4. **Backed by Sarvam's real production assets** — we plug Bulbul v3 multi-speaker dialogue and Mayura translation in, not placeholders.

### 1.3 Who's building what

| Workstream | Owner | Backup |
|---|---|---|
| Script → shotlist (LLM orchestration) | Katie | Soham |
| Image gen (character sheet, first/last frames) | Neeraj (if added) / Soham | Katie |
| Seedance 2.0 integration + prompt engine | Soham | Katie |
| Audio (Bulbul v3 dialogue + SFX + BGM) | Soham | Neeraj |
| Video stitching + post (FFmpeg + RIFE + lipsync) | Katie | Soham |
| Demo UI (Gradio or Streamlit) | Katie | Jayesh |
| Market/ICP/pitch narrative | Jayesh + Samarth | — |
| Use-case casting + scripts for demos | Jayesh | Samarth |

**Recommendation on Neeraj**: add him. He takes the image-gen pillar, which is the most contained subproblem. Seedance prompts are the critical path and need senior ownership.

---

## 2. Seedance 2.0 — the technical reality

### 2.1 Variants

| Variant | Use | Model ID (BytePlus intl.) | Kie.ai slug |
|---|---|---|---|
| **Seedance 2.0 Standard** | Final renders, 1080p | `dreamina-seedance-2-0-260128` | `bytedance/seedance-2` |
| **Seedance 2.0 Fast** | Iteration, bulk, ~25% cheaper | `dreamina-seedance-2-0-fast-260128` | `bytedance/seedance-2-fast` |
| Seedance 1.5 Pro | Fallback | — | `bytedance/seedance-1-5-pro` |

The older "Pro/Lite" names are Seedance **1.x**; the 2.0 generation is Standard/Fast. For the hackathon, **use Fast for every iteration** and Standard only for the final demo render.

### 2.2 The three mutually-exclusive modes

These cannot be combined in a single request:

| Mode | Required | Max assets | When to use |
|---|---|---|---|
| **Text-to-Video** | `prompt` only | — | Pure generative scenes, quick previews |
| **Image-to-Video (First Frame)** | `prompt + first_frame_url` | 1 image | Animating a hero shot; product reveal |
| **Image-to-Video (First & Last Frames)** | `prompt + first_frame_url + last_frame_url` | 2 images | Deterministic A→B transitions, bit-exact handoffs between stitched shots |
| **Multimodal Reference-to-Video** | `prompt` + any of `reference_image_urls / reference_video_urls / reference_audio_urls` | **9 images + 3 videos + 3 audio = 15 total** | Character consistency, style transfer, camera-move replication, music-driven pacing |

Critical nuance from the docs: to get "First Frame + Style Reference" you put the first frame in `reference_image_urls[0]` and tell the prompt `"@image1 as the opening frame"`. If you need **bit-exact** first-and-last frames, you **must** use the First & Last mode — the prompt route is a soft request, not a hard lock.

**Our pipeline uses both** — First & Last for shot-to-shot handoffs (because end frame of clip N = start frame of clip N+1), and Multimodal Reference for the in-shot style/character/motion lock.

### 2.3 Complete parameter surface

```json
{
  "prompt": "string, ≤4000 chars, EN or ZH, supports @image1 @video1 @audio1",
  "first_frame_url": "URL (PNG/JPG)",
  "last_frame_url": "URL (PNG/JPG)",
  "reference_image_urls": ["URL", "..."],   // up to 9
  "reference_video_urls": ["URL", "..."],   // up to 3, MP4/MOV, 2-15s, ≤50MB
  "reference_audio_urls": ["URL", "..."],   // up to 3, MP3/WAV, ≤15s, ≤15MB
  "resolution": "480p | 720p | 1080p",       // default 720p
  "aspect_ratio": "21:9 | 16:9 | 4:3 | 1:1 | 3:4 | 9:16",
  "duration": 4,                             // integer seconds, 4-15
  "generate_audio": true,                    // native audio/dialogue/SFX/BGM
  "return_last_frame": false,                // return final frame as image
  "seed": 20260424,                          // reproducibility
  "camera_fixed": false,                     // lock virtual camera
  "web_search": false,                       // Kie.ai-only augmentation
  "callBackUrl": "https://yours.com/cb"
}
```

**Hard limits to enforce in a validator before every API call**:
- ≤ 9 images, ≤ 30 MB each, jpeg/png/webp/bmp/tiff/gif
- ≤ 3 videos, ≤ 50 MB each, 2–15s total, mp4/mov
- ≤ 3 audio, ≤ 15 MB each, ≤ 15s each, mp3/wav
- ≤ 12 total assets
- Duration 4–15s
- **No realistic human faces in uploaded assets** — platform blocks for deepfake safety. Use original/stylized/GPT-Image-2-generated characters.

### 2.4 Open questions to resolve in the first integration sprint

Three things the sources disagree on. Verify empirically on day 1:

1. **Native audio quality** — Seedance 2.0 claims joint audio+video generation. Some sources say it's on par with Veo 3.1; others say it's SFX/BGM only, not full lip-synced dialogue. Make two test calls with `generate_audio: true` — one dialogue scene, one ambient scene — and judge. This drives whether we need Sync.so/LatentSync for lip-sync.
2. **1080p native vs upscaled** — the HuggingFace paper says native cap is 720p; marketing says 1080p. If upscaled, we may prefer native 720p + our own Topaz pass.
3. **ModelArk "Pro" tier** — one source mentions a Pro tier beyond Standard/Fast. Check the BytePlus console.

### 2.5 Pricing — pick the cheapest provider

Per second of 720p output, Standard quality:

| Provider | Standard | Fast | Notes |
|---|---|---|---|
| Volcengine Ark (CN) | ~$0.14/s | lower | Cheapest; CN account setup needed |
| BytePlus ModelArk (intl.) | ~$0.14/s | lower | Same token model; easier for India |
| **WaveSpeedAI** | **$0.14/s** | $0.12/s | **2× multiplier if reference_video used** |
| EvoLink | $0.20/s | $0.16/s | — |
| **fal.ai** | **$0.30/s** | $0.24/s | Cleanest async API; priciest |
| Replicate | TBD | — | Verify on page |
| Kie.ai | credit-based | — | Good for dev |

**Hackathon**: Kie.ai for simplicity (one API for everything), or fal.ai if we need polished async.
**Production**: BytePlus ModelArk primary, WaveSpeed secondary, fal.ai as burst/overflow. At $0.14/s, a 60s reel = ~$8.40 raw compute. Plan for ~$15–25/reel all-in (image gen + audio + compute) for margin calcs.

### 2.6 Rate limits & ops

- **2 requests/second per account**, HTTP 429 on breach (hourly reset at clock-hour boundaries)
- **3 concurrent jobs per account** (default tier)
- Latency: Fast 5s @ 720p ≈ 30–60s wall clock; Standard 10–15s @ 1080p ≈ 2–4 min; Reference-to-Video adds 30–60s overhead
- Async-only in production: submit → `taskId` → **use `callBackUrl`, not polling** (burns budget)

Production pattern: job queue (Redis Streams or SQS) + worker pool sized `3 × N` for N API keys. Exponential backoff with jitter on 429. Retry only transient 5xx. 10-minute hard timeout per job. A simple per-job ledger for cost attribution.

---

## 3. Prompt engineering — the canonical schema

This is the most important section. Steal ruthlessly from `dexhunter/seedance2-skill` and `pexoai/pexo-skills`; both repos converge on the same approach.

### 3.1 The 8-element prompt formula

```
[Subject/Character Setup] + [Scene/Environment] + [Action/Motion Description]
+ [Camera Movement] + [Timing Breakdown] + [Transitions/Effects]
+ [Audio/Sound Design] + [Style/Mood]
```

Target length: **50–100 words per beat** (one beat ≈ 3s). Hard API ceiling is **4000 characters** (~600–800 English words / ~2000 Chinese characters), so a full 15s time-segmented prompt with 4–5 beats, all `@` references, negatives, and style modifiers fits comfortably — but *don't fill the budget just because you have it*. Tighter prompts adhere better. For anything >8s, **time-segment explicitly**:

```
0–3s:  [opening scene, camera, action]
3–6s:  [mid-section development]
6–10s: [climax or key action]
10–15s: [resolution, final shot, any on-screen branding]
```

This doubles as your storyboard, your QA artifact, and your re-generation template.

### 3.2 The `@` reference syntax — assign every asset a role

Every asset must be explicitly routed in the prompt. From the dexhunter skill verbatim:

```
First frame              → @Image1 as the first frame
Last frame               → @Image2 as the last frame
Character appearance     → @Image1's character as the subject
Scene/background         → scene references @Image3
Camera movement          → reference @Video1's camera movement
Action/motion            → reference @Video1's action choreography
Visual effects           → reference @Video1's effects and transitions
Rhythm/tempo             → video rhythm references @Video1
Voice/tone               → narration voice references @Video1
Background music         → BGM references @Audio1
Sound effects            → sound effects reference @Video3's audio
Outfit/clothing          → wearing the outfit from @Image2
Product appearance       → product details reference @Image3
```

**Lint rule for our codebase**: if a prompt emits `@Foo`, the same sentence must contain one of `as the`, `references`, `reference`, or `using the`. Catch unbound references before the API call.

### 3.3 The atomic element routing table (the IP worth stealing)

From `pexoai/pexo-skills/seedance-2.0-prompter/references/atomic_element_mapping.md`. This is the decision tree for *how* to inject a user request into a prompt:

| Element | Optimal method | Rationale |
|---|---|---|
| Subject identity | **Asset** (reference image) | Too information-dense for text |
| Scene/environment | **Hybrid** | Asset for base, text for weather/mods |
| Aesthetic style | **Hybrid** | Asset defines style, text applies it |
| Composition/layout | **Asset** | Must be a keyframe image |
| Subject motion | **Hybrid** | Simple actions = text; unique motion = video ref |
| Camera language | **Text** | Standardized; text is clearer |
| Visual effects | **Text** | Describable |
| Voice timbre | **Asset** | Biometric, needs audio sample |
| Voice performance | **Text** | Speed/tone via SSML or natural language |
| Non-speech SFX/music | **Asset** | Unique sounds must be provided |
| Multi-shot | **Text** | Structured prompt |
| Pacing | **Text** | Temporal control |
| Story logic | **Text** | Abstract concept |

Implement this as a **function**, not a document. Pseudo-code:

```python
def build_prompt(user_request: UserRequest) -> SeedancePrompt:
    assets = []
    prompt_parts = []

    if user_request.character_image:
        assets.append(("image", user_request.character_image))
        prompt_parts.append(f"@image{len(assets)}'s character as the subject")

    if user_request.scene_image:
        assets.append(("image", user_request.scene_image))
        prompt_parts.append(f"scene references @image{len(assets)}")

    if user_request.motion_video:
        assets.append(("video", user_request.motion_video))
        prompt_parts.append(f"reference @video1's camera movement and action choreography")

    if user_request.bgm_audio:
        assets.append(("audio", user_request.bgm_audio))
        prompt_parts.append(f"BGM references @audio1")

    # Text-only layers
    prompt_parts.append(user_request.scene_description)
    prompt_parts.append(camera_from_shot_type(user_request.shot_type))
    prompt_parts.append(mood_descriptor(user_request.tone))
    prompt_parts.append("Avoid jitter, bent limbs, warped faces, extra fingers")

    return SeedancePrompt(
        text=" ".join(prompt_parts),
        images=[a for t, a in assets if t == "image"],
        videos=[a for t, a in assets if t == "video"],
        audios=[a for t, a in assets if t == "audio"],
    )
```

### 3.4 Camera, shot, and lighting cheat sheets

Cache these as a YAML file your prompter reads. Verbatim from dexhunter:

```yaml
camera_basic:
  push_in: "slow push toward the subject"
  pull_back: "pull away from the subject"
  pan: "horizontal rotation"
  tilt: "vertical rotation"
  track: "camera follows the subject"
  orbit: "camera circles the subject"
  oner: "continuous one-take, no cuts"

camera_advanced:
  hitchcock_zoom: "dolly zoom, vertigo effect"
  fisheye: "ultra-wide distortion"
  low_angle: "camera below subject"
  birds_eye: "top-down overhead"
  fpv: "first-person POV"
  whip_pan: "fast horizontal pan, motion blur"
  crane: "vertical arm movement"

shot_sizes:
  extreme_closeup: "eyes, mouth, or small detail only"
  closeup: "face fills frame"
  medium_closeup: "head and shoulders"
  medium: "waist up"
  full: "entire body"
  wide: "entire environment, establishing"

lighting:
  golden_hour: "warm rim light from low sun, cool cyan shadows"
  hard_noon: "harsh contrasty shadows, bleached highlights"
  soft_overcast: "flat, diffuse, low-contrast"
  neon_night: "cyan-magenta split tones, wet streets"
  candlelit: "low-key, warm pools, deep black shadows"
  medical_cgi: "clean white, high-key, shallow DOF"

style_modifiers:
  cinematic: "cinematic quality, film grain, shallow DOF, 2.35:1, 24fps"
  anime: "2D cel-shaded anime style"
  ink_wash: "Chinese ink wash painting"
  documentary: "documentary tone, restrained narration"
  ad_commercial: "high saturation, hero product lighting, glossy"

mood:
  tense: "tense and suspenseful"
  warm: "warm and healing"
  epic: "epic and grand"
  comedic: "comedy with exaggerated expressions"
```

### 3.5 Three slot-filling templates (cover 80% of demos)

Adapted from `pexoai/pexo-skills/seedance-2.0-prompter/references/prompt_templates.md`:

**A. Cinematic character shot**
```
A cinematic {shot_type} of {character_description}. The scene is lit with
{lighting_style} lighting, creating a {mood} mood. The camera performs a
{camera_movement}. @image1 is the subject reference. @image2 is the aesthetic
style reference. Avoid jitter, warped faces, extra fingers.
```

**B. Dynamic product showcase (our brand-ad use case)**
```
A dynamic, high-energy shot of {product_name}. The product performs {product_action}.
The background is {background_description}. The video features fast-paced cuts and
{visual_effect}. @image1 is the product reference. @video1 is the motion reference for
the product action. @audio1 provides the energetic soundtrack.

0-3s:   Product enters frame with dynamic rotation, close-up on surface texture and logo.
4-8s:   Multiple angle transitions - front, side, back - with highlight scanning lights.
9-12s:  Product in lifestyle context showing usage scenario.
13-15s: Hero shot, brand tagline appears, music builds to resolution.
```

**C. Narrative scene (our storytelling/educational use case)**
```
{scene_description}. {character_1} {action_1}. Then, {character_2} {action_2}. The scene
should feel {overall_mood}. @image1 is {character_1}. @image2 is {character_2}. @image3 is
the location. @audio1 is the dialogue track. Camera: {camera_instruction}.
```

### 3.6 The 7 prompt mistakes to validate against

From the dexhunter skill — turn this into a validator:

1. **Vague references** — `reference @video1` without saying *what* (camera? motion? effects?)
2. **Conflicting instructions** — static camera + orbit in the same segment
3. **Overloading** — too many scenes in a 4–5s clip
4. **Missing `@` assignments** — asset uploaded but never referenced
5. **Ignoring audio** — no mention of BGM/dialogue/SFX in a dialogue-heavy scene
6. **Duration/complexity mismatch** — 6 scene beats crammed into 5s
7. **Real faces** — will be blocked at the platform layer

```python
def validate_prompt(prompt: SeedancePrompt) -> list[ValidationError]:
    errors = []

    # Rule 4 — every uploaded asset must be referenced
    for i in range(1, len(prompt.images) + 1):
        if f"@image{i}" not in prompt.text.lower():
            errors.append(f"image {i} uploaded but never referenced")

    # Rule 1 — every @ reference must have a role word nearby
    for ref in re.findall(r"@(image|video|audio)\d+", prompt.text):
        # check within 30 chars
        ...

    # Rule 2 — conflicting camera instructions
    camera_terms = [...]  # exclusive set
    ...

    # Rule 7 — face check via local detector before upload
    for img in prompt.images:
        if detect_realistic_face(img):
            errors.append(f"realistic face detected in {img}")

    return errors
```

### 3.7 Recurring gotchas (from both repos)

- **Separate camera motion from subject motion.** Mixing them is the #1 cause of shaky output.
- **Only one primary camera instruction per beat.** Use adverbs ("slow", "smooth", "gentle") not technical parameters.
- **Lighting has the highest quality leverage** — if you add one thing, add a lighting line.
- **Don't use "fast" across multiple dimensions.** Fast cuts + fast camera + busy scene → jitter.
- **Always include negatives**: "Avoid jitter, bent limbs, warped faces, floating objects, extra fingers, text overlay" on character shots.
- **On-screen text is unreliable**, especially Devanagari/Tamil/Bengali. **Composite all on-screen text in post** via FFmpeg drawtext or Remotion.
- **Reference videos should be short (≤10s) and single-concept.** Long refs confuse the motion extractor.

---

## 4. Pipeline architecture

### 4.1 The five-stage flow

```
 ┌────────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────┐
 │ 1. Orchestrate │ → │ 2. Image gen │ → │ 3. Video gen │ → │ 4. Audio   │ → │ 5. Stitch│
 │ PDF→shotlist   │   │ (character   │   │ (Seedance    │   │ (Bulbul+   │   │ (FFmpeg+ │
 │ via GPT-5      │   │  + keyframes)│   │  2.0)        │   │  SFX+BGM)  │   │  lipsync)│
 └────────────────┘   └──────────────┘   └──────────────┘   └────────────┘   └──────────┘
        ▲                     ▲                   ▲                 ▲               ▲
        │                     │                   │                 │               │
    Script model        GPT-Image-2 /       Seedance 2.0     Sarvam Bulbul v3   ffmpeg-python
  (Claude Opus 4.5)     Nano Banana        Fast & Standard   +ElevenLabs SFX    +RIFE +LatentSync
```

### 4.2 Stage 1 — Orchestration (Katie)

Two-stage LLM pattern. Stage A extracts the script; Stage B converts to a structured JSON shotlist.

**Stage A prompt** (Claude Opus 4.5 for Indic nuance):

```
You are a documentary scriptwriter for Indian audiences. Given this source,
produce a 60-second voiceover in {language}, ~150 words, in 3 acts
(hook 0-10s / body 10-50s / payoff 50-60s). Preserve factual claims verbatim.
Use natural code-mixing if the language is Hindi or Tamil (common English
technical words are fine). Return plain text.
```

**Stage B prompt** (GPT-5 for JSON reliability, Pydantic schema):

```python
class Shot(BaseModel):
    shot_id: int
    duration_s: int  # 5-8
    shot_type: Literal["wide","medium","closeup","extreme_closeup","insert","over_the_shoulder"]
    location: str
    characters_present: list[str]
    action: str
    dialogue_or_vo: str  # can include [PAUSE 0.5s] markers
    key_visual_prompt: str  # 30-50 words, feeds image-gen
    first_frame_from: Literal["new", "previous_last"]  # continuity
    reference_character_ids: list[str]

class ShotList(BaseModel):
    total_duration_s: int  # must equal 60
    shots: list[Shot]  # 8-12
    continuity_notes: str
    hero_character_id: str
```

Constraint: hero character must appear in ≥60% of shots. Validator enforces.

### 4.3 Stage 2 — Image generation (Neeraj/Soham)

Goal: produce a **character sheet** (for Seedance reference images) and **first/last frames** for every shot.

**Character sheet** — one image with front / 3-quarter / profile views, neutral background, consistent wardrobe. Generate via **GPT-Image-2** at `ultra` quality, 1536×1024, with `character_id` registered (if available) for downstream reuse. Cost: ~$0.17/image × 3 views ≈ $0.50 per character per project.

**First/last frames** — generate one per shot, using the character sheet as `image[0]` in `/v1/images/edits`, with a prompt derived from `key_visual_prompt + first_frame_from`. Pattern:

```python
# Frame N uses the last frame of frame N-1 to lock continuity
if shot.first_frame_from == "previous_last":
    first_frame = extract_last_frame(previous_clip_path)
else:
    first_frame = gpt_image_2.edit(
        image=[character_sheet],
        prompt=shot.key_visual_prompt,
        size="1536x1024",
        quality="high",
    )

last_frame = gpt_image_2.edit(
    image=[character_sheet, first_frame],
    prompt=f"{shot.key_visual_prompt}, end state of the action",
    size="1536x1024",
    quality="high",
)
```

**Character consistency across shots** is the make-or-break detail. Two fallbacks if GPT-Image-2 drifts:

1. Swap in **Nano Banana (Gemini 2.5 Flash Image)** for that specific shot — it's the widely-agreed winner on single-subject photoreal continuity.
2. Re-render the shot with an explicit negative prompt: `"not a different person, exact same face as reference"`.

### 4.4 Stage 3 — Video generation (Soham)

For each shot, build a Seedance 2.0 payload:

```python
def build_seedance_payload(shot: Shot, first_frame: URL, last_frame: URL,
                           character_refs: list[URL], motion_ref: URL | None,
                           bgm_ref: URL | None, mode: Literal["fast", "standard"]) -> dict:

    # Decide mode: First&Last when we have both frames and no style refs we care about
    # else Multimodal Reference with first frame encoded as reference_image_urls[0]
    use_first_last = motion_ref is None and bgm_ref is None and len(character_refs) == 0

    if use_first_last:
        return {
            "model": f"bytedance/seedance-2{'-fast' if mode == 'fast' else ''}",
            "input": {
                "prompt": build_prompt(shot, mode="first_last"),
                "first_frame_url": first_frame,
                "last_frame_url": last_frame,
                "resolution": "720p" if mode == "fast" else "1080p",
                "aspect_ratio": "16:9",
                "duration": shot.duration_s,
                "generate_audio": False,  # we handle audio separately
                "return_last_frame": True,
                "seed": shot.shot_id * 1000 + 42,
            }
        }
    else:
        # Multimodal reference; put first_frame as image1, character refs after
        images = [first_frame] + character_refs[:8]
        return {
            "model": f"bytedance/seedance-2{'-fast' if mode == 'fast' else ''}",
            "input": {
                "prompt": build_prompt(shot, mode="multimodal", image_count=len(images)),
                "reference_image_urls": images,
                "reference_video_urls": [motion_ref] if motion_ref else [],
                "reference_audio_urls": [bgm_ref] if bgm_ref else [],
                "resolution": "720p" if mode == "fast" else "1080p",
                "aspect_ratio": "16:9",
                "duration": shot.duration_s,
                "generate_audio": False,
                "return_last_frame": True,
                "seed": shot.shot_id * 1000 + 42,
            }
        }
```

Rules I'd wire as constants:
- `generate_audio = False` by default. Bulbul's Indic quality beats Seedance's native audio for our wedge.
- `return_last_frame = True` every time. We need it for next-shot continuity.
- `seed` is deterministic per shot — same shot regenerates identically when we tweak the prompt.
- Fast mode for every dev run; Standard only for final.

### 4.5 Stage 4 — Audio (Soham)

Three parallel tracks that get mixed in the stitcher:

**Dialogue / VO** — Sarvam Bulbul v3, multi-speaker mode:

```python
POST https://api.sarvam.ai/text-to-speech
{
  "model": "bulbul:v3",
  "language": "hi-IN",  # or ta-IN, bn-IN, te-IN, mr-IN, gu-IN, kn-IN, ml-IN, pa-IN, or-IN
  "speakers": [
    {"id": "sp1", "voice": "meera", "text": "नमस्ते, आज हम प्रकाश संश्लेषण के बारे में सीखेंगे।"},
    {"id": "sp2", "voice": "arjun", "text": "यह एक अद्भुत प्रक्रिया है।"}
  ],
  "sample_rate": 22050
}
```

Returns per-speaker WAV with shared acoustic context (speakers don't talk past each other). Align to shot timings via a timing map `{shot_id: [start_s, end_s]}`.

**BGM** — Stable Audio 2.5 for a 60s ambience bed; optionally Udio for a 15s intro sting. Pick one mood vector per video (`"upbeat indian edtech jingle, tabla and synth, 110bpm, loopable"`).

**SFX** — ElevenLabs Sound Effects v2 per shot (`"book page turn, 1.5s"`, `"camera shutter click, 0.3s"`). Triggered by bracketed markers in the shotlist (`"[SFX: page_turn]"`).

Mix with FFmpeg filtergraph in the stitcher (see 4.6).

### 4.6 Stage 5 — Stitching & post (Katie)

The critical technique: **matched end/start frames** make hard cuts invisible. We only use crossfades at act boundaries (hook → body → payoff).

Pipeline:

```bash
# For each clip, extract last frame to feed the next clip
for i in $(seq 0 $(($N-1))); do
  ffmpeg -sseof -0.04 -i clip_$i.mp4 -frames:v 1 last_$i.png
done

# After all clips are generated, concat with hard cuts
# concat demuxer preserves quality (no re-encode)
echo "file clip_0.mp4" > list.txt
for i in $(seq 1 $(($N-1))); do
  echo "file clip_$i.mp4" >> list.txt
done
ffmpeg -f concat -safe 0 -i list.txt -c copy concat.mp4

# Mix audio
ffmpeg -i concat.mp4 \
  -i dialogue.wav \
  -i bgm.wav \
  -i sfx_all.wav \
  -filter_complex "[1:a]volume=1.0[d];[2:a]volume=0.25,sidechaincompress=threshold=0.05:ratio=3[b];[3:a]volume=0.8[s];[d][b][s]amix=inputs=3:duration=longest[mix]" \
  -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k final.mp4
```

**Micro-jitter smoothing at cuts** — run `rife-ncnn-vulkan` on the 3 frames straddling every hard cut to create smooth interpolation, then splice back in. Optional but visibly better.

**On-screen text** — composite in post, never via Seedance:
```bash
ffmpeg -i final.mp4 -vf "drawtext=fontfile=NotoSansDevanagari.ttf:text='प्रकाश संश्लेषण':fontsize=72:x=(w-tw)/2:y=h-th-80:enable='between(t,0,3)'" out.mp4
```

**Lip-sync** (if Seedance's native audio disappoints): pipe each dialogue shot through **Sync.so lipsync-2** ($0.50/min), or self-host **LatentSync** (free, requires H100). LatentSync is ByteDance-trained on similar distribution to Seedance, so it's the cleanest open-source pick for our pipeline.

### 4.7 What gets dropped for the hackathon

Explicitly defer to Phase 1:
- Self-hosted LatentSync lip-sync (use Sync.so API)
- RIFE frame interpolation (skip; matched frames are already good)
- `character_id` registration (pass reference images every call instead)
- Multi-tenant accounts, auth, billing
- Evals / golden-prompt tests
- Anything non-MP4 (webhooks, thumbnails, dashboard)

---

## 5. Phase 0 — Hackathon sprint (7 days)

Assumes kickoff Monday, demo Friday evening. Adjust if your hackathon window differs.

### Day 0 (kickoff — Sunday or Monday morning)

**All hands (30 min)**
- Confirm use case cast: **3 demo scripts** ready (edtech explainer in Tamil; brand ad for a fictional Indian D2C; narrative short for a Sarvam employee birthday). Jayesh/Samarth own scripts + character visual briefs.
- Confirm resources: GPU credits approved? API budget confirmed? Kie.ai or fal.ai or BytePlus account provisioned?
- Agree on storage: an S3 bucket (or equivalent) for all generated assets with public read URLs, because Seedance needs URLs not bytes.

**Technical spike — Soham (2 hours)**
- Make one Seedance 2.0 Fast text-to-video call with default params. Confirm API access, latency, payload shape.
- Make one Multimodal Reference-to-Video call with a character ref + BGM ref. Confirm the `@` syntax works as documented.
- Resolve the three open questions from §2.4 empirically.

### Day 1 (Mon) — scaffold

- **Soham**: Python wrapper class `SeedanceClient` with Fast/Standard, all 3 modes, validator (§3.6), retry logic, callback handler. Push to repo.
- **Katie**: script → shotlist pipeline with the two-stage LLM pattern. Test on one sample PDF end-to-end, output valid JSON.
- **Neeraj/Soham**: GPT-Image-2 client with character sheet + first-frame + last-frame helpers. Generate the character sheet for demo hero 1.
- **Jayesh + Samarth**: freeze the 3 demo scripts (~150 words each), write `key_visual_prompt` for every shot, confirm ICP pitch narrative.

**End-of-day smoke test**: one shot, one character, one scene — generate a 5s Seedance clip from the pipeline. Must render by midnight.

### Day 2 (Tue) — character + clip quality

- **Soham**: prompt engine (§3) — camera/shot/lighting YAML, `build_prompt` function, 3 templates. Wire into clip generator.
- **Neeraj/Soham**: generate first/last frames for all 10 shots of demo 1. Iterate on character drift; swap to Nano Banana for any drifting shot.
- **Katie**: Bulbul v3 dialogue pipeline + timing map per shot. Generate dialogue for demo 1.
- **Katie**: FFmpeg stitcher scaffolded with concat + text overlay + audio mix. Test on 3 dummy clips.

**End-of-day target**: first full 30s cut of demo 1 (6 shots, no lipsync, no BGM).

### Day 3 (Wed) — audio + stitch

- **Soham**: ElevenLabs SFX integration, Stable Audio BGM bed, mix filtergraph tuned.
- **Katie**: Sync.so lipsync integration (one API call per dialogue shot). Fallback: if Seedance native audio is good enough for non-dialogue shots, skip lipsync there.
- **Neeraj**: help polish character sheet for demos 2 and 3.
- **Jayesh**: start drafting the pitch deck outline — what we built, market, Sarvam's moat, demo.

**End-of-day target**: full 60s demo 1 with audio, ready to show. Demo 2 character sheet done.

### Day 4 (Thu) — demos 2 and 3 + UI

- **Katie + Soham**: parallelize demos 2 and 3 through the pipeline.
- **Katie**: Gradio/Streamlit UI — file upload (char image, scene image, reference video, reference audio), text input (script or topic), language selector, "generate" button with live progress.
- **Soham**: evals — run 5 golden prompts, grade outputs for character consistency, motion quality, audio sync. Fix one failure mode.

**End-of-day target**: 3 demos locked. UI deployed (even if on a laptop).

### Day 5 (Fri morning) — polish + dry run

- Full dry run, morning. Test every demo twice. Time the pipeline — ideally <10 min per demo.
- Buffer for one last surprise (character drift on a hero shot; rate limit hit; stitch artifact).
- Jayesh/Samarth: finalize pitch deck; Samarth times the demo to exactly fit the slot.

### Day 5 (Fri evening) — demo

Live demo flow (5–7 min):
1. **Hook (45s)**: "Every Indian edtech/OTT/brand has the same content problem: production cost. Global AI video tools don't speak our languages and don't look like our people. We built a pipeline that does."
2. **Demo 1 — Tamil edtech explainer (60s video)**: upload a PDF, hit generate, show the final 60s reel with a Tamil VO, a consistent animated tutor character, and on-screen Tamil math notation. Emphasise the reference-video-for-camera upload.
3. **Demo 2 — brand ad (60s)**: upload a product image + a reference ad's motion video + an audio jingle. Show the output. Emphasise the multimodal reference mode.
4. **Demo 3 — narrative (20s teaser)**: lighter demo, character-driven story, emphasise character consistency across shots.
5. **The moat (60s)**: Bulbul v3 + Mayura + sovereign deployment = no global player can serve this market. Show the shotlist JSON and architecture diagram briefly.
6. **Ask**: iPad / PS5. Close.

### Scope guardrails

**Must work**: PDF→demo-1 video end-to-end. Multimodal reference mode. Bulbul v3 dialogue. One language (Hindi or Tamil).
**Should work**: demos 2 and 3. UI. 2+ languages.
**Nice to have**: real-time progress in UI. Lipsync. Thumbnail gen.

**If time pressure hits on Thursday**, cut demos 2 and 3 content but keep the capability demo-able via pre-rendered video. Cut lipsync before cutting multi-speaker audio. Cut the UI before cutting the shotlist pipeline.

---

## 6. Phases 1–3 — productionization (12–18 months)

### Phase 1 — "The Indic video API" (months 1–3)

**Goal**: private beta with 3 design partners (1 OTT, 1 edtech, 1 ad agency). Usage-based API at ₹500/min output.

**What ships**:
- REST API: `POST /v1/videos` with typed schema (text, character_ref, scene_refs, motion_ref, bgm_ref, language, duration, aspect_ratio). Returns `job_id`. `GET /v1/videos/{job_id}` for status + URL.
- 11 Indic languages via Bulbul v3; Mayura translation for script in any language → target language.
- Character library: registered characters persistent across videos, `character_id` reference.
- Multi-shot 60–120s outputs with matched-frame stitching.
- LatentSync self-hosted lipsync on H100s (saves ~$200/mo per 10k min vs Sync.so at volume).
- Webhook + async download. Retry/idempotency.
- Cost ledger per job: image + video + audio + lipsync + stitch tallied.
- SLA: p95 ≤ 10 min for a 60s video, 99% success.
- Admin dashboard (Retool or internal) for queue monitoring and re-runs.

**Team**: Soham (lead eng), Katie (full-stack), Neeraj (image/audio), 1 MLE hire, 1 product manager — maybe Samarth rotates in.

**Budget**: ~$10k/month API spend at design-partner scale; ~$4k/month infra (GPU reservation for LatentSync); ~$8k/month content ops (evals, hand-graded test set).

**Evals infrastructure** (must build, not optional):
- 30 golden prompts per use case (edtech/ad/narrative) = 90 total
- Auto-graded on: character consistency (CLIP similarity across shots), motion quality (via a VLM grader), prompt adherence (CLIP score), audio sync (wav2vec alignment), cost (<target)
- Run weekly, track regressions

### Phase 2 — "Enterprise-grade" (months 4–9)

**Goal**: 3 paying design partners convert + 5 more. ₹1Cr+ ARR annualized.

**What ships**:
- **Self-serve onboarding**: signup → API keys → Stripe/Razorpay billing. Free tier (5 min/month), $ $$$ paid tiers by output minute.
- **Custom character training**: customer-provided 3–6 images → registered character_id. Start with GPT-Image-2 character registration; graduate to a small Seedance LoRA if budget allows.
- **Template library**: 20 pre-built templates per vertical (edtech / ad / narrative / social) with fill-in-the-blank UX.
- **Studio UI**: storyboard view (edit shotlist between stage 1 and stage 3 — the human-in-the-loop review gate), regenerate individual shots, preview lipsync before final render.
- **Dubbing-only mode**: skip video gen; take an existing video + new language → lip-synced translated video. This is a wedge into OTT/movie dubbing. Integrates Mayura for script translation.
- **Multi-provider orchestration**: fall back to Kling or Veo 3.x if Seedance is down or a specific shot quality-grades better elsewhere. Provider abstraction layer.
- **Compliance**: data residency options, PII redaction, audit logs.

**Team**: +2 eng, +1 designer, +1 sales/GTM.

**Budget**: ~$40k/month API + infra; ~$100k/month team loaded cost.

### Phase 3 — "Sovereign + scale" (months 10–18)

**Goal**: ₹10Cr+ ARR with a clear path to ₹50Cr. Sovereign / govt / BFSI deployments live.

**What ships**:
- **Sovereign deployment SKU**: fully on-prem or VPC, air-gapped option. Base model sits on customer GPUs; Sarvam ships the orchestration + Indic layer. Price: ₹1–5Cr annual per tenant.
- **Own inference stack**: license or host Seedance checkpoints where feasible (or switch to an open-source equivalent like Wan 2.2/Open-Sora 3 for sovereign tenants). Reduces per-minute cost 3–5× at scale.
- **Fine-tuned Indic prompting model**: a small model (7–13B) trained on our own prompt-quality pairs that rewrites user requests into optimal Seedance prompts. The "atomic element mapping" table (§3.3) becomes training data.
- **Storyboard editor with frame-level control**: inpaint specific regions, change dialogue lines and regenerate only that shot.
- **Collaboration**: teams, reviews, approvals, Slack/Teams integrations.
- **Creator tier (optional)**: ₹999/month for 15 min of output, if the unit economics work. Mostly a funnel/virality play.

**Team**: +5 eng, +2 research (if building FT models), +3 GTM, +2 customer success.

**Budget**: $3–5M annualized; revenue target ₹10–20Cr (ARR).

### Moat compounding

| Layer | Differentiator | Depth over time |
|---|---|---|
| Prompt engine | Atomic element mapping + Indic-trained rewriter | Grows with usage data |
| Indic voice/lipsync | Bulbul + Saaras + LatentSync-Indic | Grows with customer audio corpus |
| Template + character library | Verticalized, branded, per-tenant | Grows with enterprise logos |
| Sovereign/compliance | MeitY partnership, on-prem SKU | Global-player-proof |
| Cost | Own inference + provider arbitrage | Widens gap vs pure wrappers |

None of those layers are Seedance-dependent. If a better model emerges, we swap the backend.

---

## 7. Market and competitive context (condensed)

### 7.1 Why Indic, why now

- Indian edtech: ₹60–80k Cr market in 2025 → projected ₹2.4 lakh Cr by 2030. Video content production is 10–15% of opex = ₹7–12k Cr addressable.
- Indian advertising: ₹1.1 lakh Cr total, ~₹25k Cr digital video.
- Global dubbing: ~$4B in 2024 → $7B by 2030. India share ~8–10% = **$300–400M/yr** addressable just on dubbing.
- Byju's collapse (and the edtech reset that followed) made the whole sector **asset-light by policy**. They will never build in-house video again.

### 7.2 Model competitive landscape

For our purposes (April 2026):

| Model | Native audio | 1-min capable | Indic | Our use |
|---|---|---|---|---|
| **Seedance 2.0** | Yes (new) | Via stitching | No | **Primary** — best price/quality + cleanest multimodal reference API |
| **Kling 2.5/2.6** | Partial | Via stitching | No | **Backup** — stronger motion; more expensive |
| **Veo 3.1** | Yes (SOTA) | Via stitching | Weak | **Premium alternate** for paying customers on Vertex |
| **Sora 2 / Pro** | Yes (SOTA) | Via stitching | No | Out — app-first distribution, API limited |
| **Runway Gen-4 / Aleph** | No / N/A | Via stitching | No | Out — too expensive at our target ARPU |
| **Hailuo 02 / Vidu** | No | Via stitching | No | Cost-floor competitors |

### 7.3 Indic incumbents we have to beat

- **Gan.ai** — Hyderabad; lipsync + dubbing. Narrow.
- **Neural Garage** — visual dubbing. Narrow.
- **Dubverse.ai**, **Camb.ai**, **Murf.ai** — dubbing-only, no generative video.
- **Invideo AI** — global SaaS, template editor on stock + generative; not Indic-first.
- **Steve.ai**, **Rephrase.ai (acquired by Adobe)** — out or narrow.

**Nobody is building "full 60s Indic generated video with consistent characters and multimodal reference mode" in India.** That's our window.

### 7.4 Pricing strategy

Don't chase the creator tier as the core bet. Target:

| Tier | Price | Target | Rationale |
|---|---|---|---|
| **API usage** | ₹200–500/min output | Mid-market (agencies, edtech content ops) | Matches ~$5–6 intl. API pricing at 60–70% discount |
| **Enterprise** | ₹2–10L/mo flat + usage | Top OTT, top edtech, BFSI | Includes sovereign option, custom characters, SLAs |
| **Sovereign** | ₹1–5Cr/yr | Govt, MeitY-aligned, BFSI | On-prem/VPC; Sarvam moat |
| Creator (later) | ₹999/mo for 15 min | Tier-1 creators | Funnel, not revenue |

Base cost per 60s video: ~$15–25 (image + video compute + audio + lipsync). Gross margin target: **60–70%** at enterprise, **50%** at API.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Seedance 2.0 native audio is weak for Indic dialogue | High | Low (we already plan to use Bulbul) | `generate_audio=False`, use Bulbul + lipsync |
| Character drift across 6–10 shots ruins demos | High | High | GPT-Image-2 character sheet + Nano Banana fallback + explicit negative prompts |
| ByteDance API procurement concerns for enterprise India buyers | Medium | Medium | Multi-provider architecture from day 1; Veo/Kling fallback available |
| Seedance rate limits throttle the demo on the day | Medium | High | Provision 3+ API keys; pre-render all demos by Thursday night |
| Cost per video too high for sub-enterprise pricing | Medium | Medium | Own-inference roadmap in Phase 3; provider arbitrage in Phase 2 |
| Indic lipsync quality drops on Tamil/Telugu (retroflex plosives) | Medium | Medium | LatentSync-Indic fine-tune on customer audio in Phase 2; accept small drop for MVP |
| Frontier model leapfrogs Seedance (Veo 4, Sora 3) | High over 18mo | Low | We're orchestration; swap backends without breaking the product |
| Deepfake/IP lawsuits | Low | High | Face detector on uploads; T&Cs prohibiting celebrity replication; watermarking option |
| Sarvam distraction — core LLM/voice work takes priority | Medium | High | Keep team small and clearly-scoped; run as a focused pod |

---

## 9. Resources needed

### Hackathon (Phase 0)

- **API credits**: $500 (Kie.ai or BytePlus), $300 (OpenAI/Anthropic), $200 (ElevenLabs), $0 (Sarvam internal). Plan ~$1,000 total.
- **GPU**: one H100 for LatentSync if we go that route, else nothing (Sync.so API).
- **Storage**: an S3 bucket with public-read for asset URLs.
- **People**: 4–5 as listed; add Neeraj for image-gen pillar.
- **Decisions before kickoff**:
  - Final provider choice: **Kie.ai for Phase 0** (simplest integration).
  - Demo language(s): Hindi + Tamil.
  - Animated vs live-action: **animated for Phase 0** (easier lipsync, avoids face-detector blocks on uploads).

### Phase 1 (Months 1–3)

- **Team**: +1 MLE, +1 PM (or Samarth rotates in). Total 6–7.
- **Budget**: ~$20k/month (API $10k + infra $4k + content ops $6k).
- **GPU**: reserved H100 (for LatentSync self-host), ~$2.5k/month.
- **Design partner commitments**: 3 signed LOIs worth ₹3–5L/month combined in Phase 1.

---

## 10. Appendix A — reference code scaffold (pipeline skeleton)

```python
# seedance_indic/client.py
from typing import Literal
import httpx, time, os

class SeedanceClient:
    def __init__(self, provider: Literal["kie", "fal", "byteplus"] = "kie"):
        self.provider = provider
        self.base_url, self.token = _provider_config(provider)

    def generate(self, payload: dict, mode: Literal["fast", "standard"] = "fast",
                 callback_url: str | None = None) -> str:
        """Submit a Seedance 2.0 job. Returns task_id."""
        body = {
            **payload,
            "model": f"bytedance/seedance-2{'-fast' if mode == 'fast' else ''}",
        }
        if callback_url:
            body["callBackUrl"] = callback_url
        r = httpx.post(f"{self.base_url}/video/seedance-2", json=body,
                       headers={"Authorization": f"Bearer {self.token}"}, timeout=60)
        r.raise_for_status()
        return r.json()["data"]["taskId"]

    def wait(self, task_id: str, timeout_s: int = 600, poll_s: int = 5) -> dict:
        start = time.time()
        while time.time() - start < timeout_s:
            r = httpx.get(f"{self.base_url}/common/get-task-detail",
                          params={"taskId": task_id},
                          headers={"Authorization": f"Bearer {self.token}"})
            data = r.json()["data"]
            if data["state"] == "success":
                return data
            if data["state"] == "failed":
                raise RuntimeError(data.get("failMsg", "generation failed"))
            time.sleep(poll_s)
        raise TimeoutError()
```

```python
# seedance_indic/prompt.py
import re
from dataclasses import dataclass, field

CAMERA_VOCAB = {
    "push_in": "slow push toward the subject",
    "orbit": "camera orbits the subject smoothly",
    "whip_pan": "fast whip pan with motion blur",
    ...
}

@dataclass
class Shot:
    shot_id: int
    duration_s: int
    shot_type: str
    action: str
    dialogue_or_vo: str
    key_visual_prompt: str
    camera: str = "static"
    lighting: str = "cinematic"
    mood: str = "neutral"

def build_prompt(shot: Shot, image_count: int, video_count: int = 0,
                 audio_count: int = 0, language: str = "English") -> str:
    parts = []
    # 1. subject
    if image_count >= 1:
        parts.append("@image1's character is the subject")
    # 2. scene
    if image_count >= 2:
        parts.append("scene references @image2")
    # 3. action + timing
    parts.append(f"0-{shot.duration_s}s: {shot.action}")
    # 4. camera
    parts.append(CAMERA_VOCAB.get(shot.camera, shot.camera))
    # 5. camera ref video
    if video_count >= 1:
        parts.append("reference @video1's camera movement and action choreography")
    # 6. lighting + style
    parts.append(f"{shot.lighting} lighting")
    parts.append(f"{shot.mood} mood, cinematic, shallow DOF, film grain")
    # 7. audio
    if audio_count >= 1:
        parts.append("BGM references @audio1")
    # 8. negatives
    parts.append("Avoid jitter, bent limbs, warped faces, extra fingers, text overlay")
    return ". ".join(parts)

def validate_prompt(text: str, n_images: int, n_videos: int, n_audios: int) -> list[str]:
    errors = []
    for i in range(1, n_images + 1):
        if f"@image{i}" not in text.lower():
            errors.append(f"image{i} uploaded but unreferenced")
    for i in range(1, n_videos + 1):
        if f"@video{i}" not in text.lower():
            errors.append(f"video{i} uploaded but unreferenced")
    for i in range(1, n_audios + 1):
        if f"@audio{i}" not in text.lower():
            errors.append(f"audio{i} uploaded but unreferenced")
    # every @ref must have a role word within 40 chars
    for m in re.finditer(r"@(image|video|audio)\d+", text.lower()):
        window = text.lower()[max(0, m.start()-40):m.end()+40]
        if not any(k in window for k in ["as the", "references", "reference", "using the"]):
            errors.append(f"{m.group()} has no role assignment")
    return errors
```

```python
# seedance_indic/orchestrate.py
from pydantic import BaseModel
from anthropic import Anthropic

class Shot(BaseModel):
    shot_id: int
    duration_s: int  # 5-8
    shot_type: str
    location: str
    characters_present: list[str]
    action: str
    dialogue_or_vo: str
    key_visual_prompt: str
    first_frame_from: str  # "new" or "previous_last"
    reference_character_ids: list[str] = []

class ShotList(BaseModel):
    total_duration_s: int
    shots: list[Shot]
    hero_character_id: str

def build_shotlist(source: str, language: str = "hi-IN") -> ShotList:
    client = Anthropic()
    # stage A: script
    script = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": _stage_a_prompt(source, language)}]
    ).content[0].text
    # stage B: shotlist JSON
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        tools=[{"name": "return_shotlist", "input_schema": ShotList.model_json_schema()}],
        tool_choice={"type": "tool", "name": "return_shotlist"},
        messages=[{"role": "user", "content": _stage_b_prompt(script)}]
    )
    return ShotList(**response.content[0].input)
```

```python
# seedance_indic/stitch.py
import subprocess
from pathlib import Path

def stitch_clips(clips: list[Path], dialogue_wav: Path, bgm_wav: Path,
                 sfx_wav: Path, out: Path):
    # 1. concat video
    list_file = out.parent / "list.txt"
    list_file.write_text("\n".join(f"file '{c.absolute()}'" for c in clips))
    concat = out.parent / "concat.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file), "-c", "copy", str(concat)
    ], check=True)
    # 2. mix audio and mux
    filtergraph = (
        "[1:a]volume=1.0[d];"
        "[2:a]volume=0.25,sidechaincompress=threshold=0.05:ratio=3[b];"
        "[3:a]volume=0.8[s];"
        "[d][b][s]amix=inputs=3:duration=longest[mix]"
    )
    subprocess.run([
        "ffmpeg", "-y", "-i", str(concat),
        "-i", str(dialogue_wav), "-i", str(bgm_wav), "-i", str(sfx_wav),
        "-filter_complex", filtergraph,
        "-map", "0:v", "-map", "[mix]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        str(out)
    ], check=True)
```

---

## 11. Appendix B — prompt templates library

Save these to `prompts/templates.yaml` and have the prompter pick one by scenario tag.

```yaml
cinematic_character:
  tags: [narrative, explainer, lifestyle]
  template: |
    A cinematic {shot_type} of {character_description}. The scene is lit with
    {lighting_style} lighting, creating a {mood} mood. The camera performs a
    {camera_movement}. @image1 is the subject reference. @image2 is the aesthetic
    style reference. Avoid jitter, warped faces, extra fingers.

product_showcase:
  tags: [brand, ad, ecommerce]
  template: |
    A dynamic, high-energy shot of {product_name}. The product performs
    {product_action}. Background is {background_description}. Fast-paced cuts,
    {visual_effect}. @image1 is the product reference. @video1 is the motion
    reference. @audio1 is the soundtrack.

    0-3s:   Product enters frame with {entry_action}, close-up on {surface_detail}.
    4-8s:   Angle transitions showing {feature_1}, {feature_2}, {feature_3}.
    9-12s:  Product in {context} showing usage.
    13-15s: Hero shot, {tagline} appears, music builds.

narrative_two_character:
  tags: [storytelling, drama, comedy]
  template: |
    {scene_description}. {character_1_name} {action_1}. Then, {character_2_name}
    {action_2}. The scene feels {overall_mood}.
    @image1 is {character_1_name}. @image2 is {character_2_name}. @image3 is the
    location. @audio1 is the dialogue track. Camera: {camera_instruction}.

edtech_explainer:
  tags: [education, indic, explainer]
  template: |
    A {shot_type} of {tutor_character} explaining {concept} in a {setting}. The
    tutor speaks warmly and clearly. @image1 is the tutor. @image2 is the
    background blackboard/whiteboard/environment. On-screen elements will be
    composited in post - do not render text in the video. {lighting}, {mood}
    atmosphere. Camera: {camera_movement}. Avoid jitter, warped faces,
    extra fingers, any on-screen text.

indic_dubbed_content:
  tags: [dubbing, localization]
  template: |
    Regenerate @video1 with the motion and camera preserved exactly. Replace the
    lip movements to match {target_language} phonemes. All other visual elements
    remain identical. @audio1 is the new target-language audio.
```

---

## 12. Appendix C — key URLs to bookmark

**Seedance 2.0**
- Official product: https://seed.bytedance.com/en/seedance2_0
- BytePlus ModelArk tutorial: https://docs.byteplus.com/en/docs/ModelArk/2291680
- BytePlus prompt guide: https://docs.byteplus.com/en/docs/ModelArk/2222480
- Kie.ai docs: https://docs.kie.ai/market/bytedance/seedance-2
- Kie.ai Fast: https://docs.kie.ai/market/bytedance/seedance-2-fast
- fal.ai hub: https://fal.ai/seedance-2.0
- fal.ai reference-to-video: https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
- Replicate: https://replicate.com/bytedance/seedance-2.0
- WaveSpeed multimodal guide: https://wavespeed.ai/blog/posts/seedance-2-0-complete-guide-multimodal-video-creation/
- Awesome Seedance 2: https://github.com/EvoLinkAI/awesome-seedance-2-guide/
- Pricing breakdown: https://aicost.org/blog/seedance-2-0-api-pricing-breakdown-2026
- Rate limits: https://www.nemovideo.com/blog/seedance-2-0-rate-limit
- Error guide: https://blog.segmind.com/seedance-2-0-error-guide-every-error-explained-with-fixes/

**Prompt engineering references (what we studied)**
- `dexhunter/seedance2-skill` SKILL.md: https://github.com/dexhunter/seedance2-skill/blob/main/SKILL.md
- `pexoai/pexo-skills` Seedance prompter: https://github.com/pexoai/pexo-skills/blob/main/skills/seedance-2.0-prompter/SKILL.md
- Atomic element mapping (steal this): https://github.com/pexoai/pexo-skills/blob/main/skills/seedance-2.0-prompter/references/atomic_element_mapping.md
- Prompt templates: https://github.com/pexoai/pexo-skills/blob/main/skills/seedance-2.0-prompter/references/prompt_templates.md
- Pexo generate.js dispatcher (good code to copy): https://github.com/pexoai/pexo-skills/blob/main/skills/videoagent-video-studio/tools/generate.js

**Adjacent stack**
- Sarvam TTS (Bulbul v3): https://docs.sarvam.ai
- ElevenLabs SFX: https://elevenlabs.io/docs/api-reference/sound-generation
- Stable Audio 2.5: https://stability.ai/stable-audio
- Sync.so lipsync-2: https://sync.so/docs
- LatentSync (ByteDance, OSS): https://github.com/bytedance/LatentSync
- GPT-Image-2 docs: https://platform.openai.com/docs/guides/images
- Nano Banana (Gemini 2.5 Flash Image): https://ai.google.dev/gemini-api/docs/image-generation

**Market references**
- Artificial Analysis Video Arena: https://artificialanalysis.ai/text-to-video
- VBench 2.0: https://vchitect.github.io/VBench-project/
- Dentsu India "This Year Next Year": https://www.groupm.com/tynyindia
- Bain "India SaaS" reports: https://www.bain.com
- Redseer edtech reports: https://redseer.com

---

## 13. Open items to close before kickoff

1. Confirm API budget (~$1,000 for Phase 0) with Vivek/leadership.
2. Decide demo-language shortlist (recommend Hindi + Tamil).
3. Confirm Neeraj joins (recommend yes).
4. Provision Kie.ai / fal.ai / BytePlus ModelArk account (both; keep one as fallback).
5. Provision S3 bucket for public asset URLs.
6. Confirm 3 demo scripts with Jayesh + Samarth by Sunday EOD.
7. Make the 3 empirical API test calls (§2.4) before Monday kickoff to resolve native-audio / 1080p / Pro-tier ambiguities.
8. Agree team comms channel (Slack #hackathon-video) and daily standup time (15 min, 9:30am).

---

*End of roadmap. Happy to drill into any section — prompt engine, stitching specifics, a different pricing cut, or the shotlist pipeline as a runnable scaffold.*
