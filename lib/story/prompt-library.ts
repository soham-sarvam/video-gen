/**
 * Inline prompt knowledge for Seedance 2.0 storyboarding.
 *
 * Replaces all runtime `fs.readFile` calls to skills/ folder.
 * Contains distilled prompt engineering knowledge, camera language,
 * style pack directives, and the storyboard grammar.
 */

// ---------------------------------------------------------------------------
// Seedance 2.0 core prompt knowledge (distilled from prompt guides)
// ---------------------------------------------------------------------------
export const SEEDANCE_CORE = `
## Seedance 2.0 Prompt Engineering

### @ Reference System
- @Image1 through @Image9: assign explicit roles — "as the subject", "as the first frame", "scene references @Image2"
- @Video1 through @Video3: "reference @Video1's camera movement", "reference @Video1's action choreography"
- @Audio1 through @Audio3: "BGM references @Audio1", "narration voice references @Audio1"
- Always state WHAT each reference is for. Never leave @references ambiguous.

### Prompt Structure (8-element formula)
1. Subject/Character — who or what is on screen, appearance, clothing, expression
2. Scene/Environment — location, time of day, weather, set dressing, props
3. Action/Motion — what happens, physical movements, gestures, interactions
4. Camera Movement — dolly, pan, tilt, orbit, push-in, pull-back, tracking, crane
5. Timing Breakdown — for 10s+ videos, segment by seconds (0-3s, 3-6s, etc.)
6. Transitions/Effects — cuts, fades, speed ramps, lens flares, motion blur
7. Audio/Sound Design — music genre, SFX, ambient sounds, voice delivery
8. Style/Mood — cinematic, warm, gritty, dreamlike, neon-lit, etc.

### Camera Language
| Term | Usage |
|------|-------|
| Push in / Slow push | Camera moves toward subject |
| Pull back | Camera moves away |
| Pan left/right | Horizontal rotation |
| Tilt up/down | Vertical rotation |
| Tracking / Follow shot | Camera follows subject |
| Orbit / Revolve | Camera circles subject |
| Dolly zoom (Hitchcock) | Push in + zoom out — vertigo effect |
| Crane shot | Vertical rise or descent |
| Whip pan | Fast horizontal pan with motion blur |
| Handheld | Organic, slightly shaky feel |
| Steadicam | Smooth glide following subject |

### Shot Sizes
| Shot | Framing |
|------|---------|
| Extreme close-up (ECU) | Eyes, lips, small detail |
| Close-up (CU) | Face fills frame |
| Medium close-up (MCU) | Head and shoulders |
| Medium shot (MS) | Waist up |
| Full shot (FS) | Entire body |
| Wide / Establishing | Full environment visible |
| Bird's eye | Top-down overhead |

### Duration Guidelines
- 4-5s: single action, one camera move, minimal scene complexity
- 6-8s: two actions or a camera move + subject motion
- 9-12s: use time segments, room for B-roll or reaction
- 13-15s: multi-segment with transitions, dialogue + visual storytelling

### Audio Direction Keywords
- "tight lip-sync, mouth articulates every phoneme" — for dialogue beats
- "ambient: [description]" — background sounds
- "SFX: [specific sound]" — punctual sound effects
- "BGM: [genre/mood] at [intensity]" — background music

### Mandatory Endings
- End every prompt with negatives: "Avoid: identity drift, warped face, extra people, cartoon style, text glitches, jitter."
`.trim();

// ---------------------------------------------------------------------------
// Style pack directives (inline replacements for SKILL.md files)
// ---------------------------------------------------------------------------
export interface StyleDirective {
  id: string;
  label: string;
  description: string;
  visualStyle: string;
  cameraPreferences: string;
  lightingPreferences: string;
  pacingNotes: string;
  defaultAspectRatio?: string;
  defaultBgmIntensity?: string;
}

export const STYLE_DIRECTIVES: Record<string, StyleDirective> = {
  "01-cinematic": {
    id: "01-cinematic",
    label: "Cinematic",
    description: "Wide aspect, shallow DOF, film grain, slow camera moves.",
    visualStyle: "Cinematic quality, shallow depth of field, film grain, 2.35:1 widescreen feel, rich color grading with warm amber highlights and cool blue shadows, anamorphic lens flares.",
    cameraPreferences: "Slow deliberate camera moves: dolly-in, pull-back, low-angle hero shots, crane establishing shots. Prefer tracking shots over static. Rack focus between foreground and background subjects.",
    lightingPreferences: "Three-point lighting with dramatic key-to-fill ratio. Golden hour warmth for exteriors. Chiaroscuro for emotional scenes. Practical lights (lamps, candles, neon) as motivated sources.",
    pacingNotes: "Longer beats (8-15s), let moments breathe. Slow dissolves between scenes. Build tension with gradual push-ins.",
    defaultBgmIntensity: "mid",
  },
  "02-3d-cgi": {
    id: "02-3d-cgi",
    label: "3D / CGI",
    description: "Volumetric lighting, ray-traced reflections, stylized geometry.",
    visualStyle: "Photorealistic 3D render quality, volumetric god rays, ray-traced reflections on wet surfaces, subsurface scattering on organic materials, procedural textures, clean geometric environments.",
    cameraPreferences: "Smooth orbital camera, flythrough sequences, impossible camera angles (through walls, micro scale), rack focus with extreme shallow DOF. Techno-crane sweeping movements.",
    lightingPreferences: "Volumetric fog with directional beams, HDR environment lighting, neon rim lights, caustics on glass/water surfaces.",
    pacingNotes: "Medium pacing, emphasis on reveal moments. Use slow-motion for particle effects and material showcases.",
  },
  "03-cartoon": {
    id: "03-cartoon",
    label: "Cartoon",
    description: "Flat shading, bouncy timing, bold outlines.",
    visualStyle: "Bold black outlines, flat cel-shaded colors, exaggerated squash-and-stretch, saturated primary palette, simple geometric backgrounds with limited detail.",
    cameraPreferences: "Mostly static or simple pans. Occasional dramatic zoom-in for comedy beats. Snap cuts between scenes rather than smooth transitions.",
    lightingPreferences: "Flat lighting with minimal shadows. Occasional spotlight for dramatic comedy moments. Bright, even illumination.",
    pacingNotes: "Snappy timing — quick cuts, hold on poses for comedic effect. Exaggerated anticipation before action. Bouncy easing on all motion.",
  },
  "04-comic-to-video": {
    id: "04-comic-to-video",
    label: "Comic to Video",
    description: "Panel-frame transitions, halftone shading, motion bursts.",
    visualStyle: "Comic book aesthetic: bold ink outlines, halftone dot shading, Ben-Day dots, speed lines for motion, dramatic impact frames, split-panel compositions, thought/speech bubbles as overlays.",
    cameraPreferences: "Panel-to-panel transitions (wipe, slide, zoom into panel). Camera shake on impact moments. Zoom-burst into action scenes.",
    lightingPreferences: "High-contrast with deep blacks. Color holds (single color wash) for mood shifts. Rim lighting on characters.",
    pacingNotes: "Staccato rhythm — hold on panels, then burst into motion. Impact frames freeze for 0.5s before releasing into action.",
  },
  "05-fight-scenes": {
    id: "05-fight-scenes",
    label: "Fight / Action",
    description: "Whip pans, impact frames, slow-mo punctuation.",
    visualStyle: "High contrast, desaturated with selective color pops (blood red, spark orange). Motion blur on fast moves, sharp freeze on impacts. Dust particles, debris, sparks as ambient FX.",
    cameraPreferences: "Whip pans between combatants, handheld shake during chaos, snap zoom on impacts, slow-motion for key strikes, low-angle power shots, over-the-shoulder during exchanges.",
    lightingPreferences: "Dramatic backlighting, rim light separating fighters from background, strobe flashes on impacts, environmental destruction lighting (fire, sparks).",
    pacingNotes: "Fast-slow-fast rhythm: rapid exchange → slow-mo impact → rapid recovery. 4-6s per exchange. B-roll reaction shots between combos.",
    defaultBgmIntensity: "peak",
  },
  "06-motion-design-ad": {
    id: "06-motion-design-ad",
    label: "Motion Design Ad",
    description: "Kinetic typography, geometric transitions, beat-synced cuts.",
    visualStyle: "Clean minimalist backgrounds, geometric shape animations, kinetic typography with scale/rotation, brand color palette, smooth vector-style graphics, particle systems.",
    cameraPreferences: "Z-axis pushes through layers, smooth 2.5D parallax, zoom transitions synced to music beats, seamless morphing between scenes.",
    lightingPreferences: "Even studio lighting, gradient backgrounds, subtle shadows for depth on floating elements.",
    pacingNotes: "Beat-synced cuts — every transition lands on a musical hit. Fast pacing (2-4s per scene). Build to a crescendo with faster cuts.",
  },
  "07-ecommerce-ad": {
    id: "07-ecommerce-ad",
    label: "E-commerce Ad",
    description: "Product hero rotations, lifestyle context, clean studio.",
    visualStyle: "Clean white/neutral studio background, product floating or on pedestal, high-key lighting showing texture and detail, lifestyle context shots with warm environments.",
    cameraPreferences: "Slow 360° orbit for hero product, push-in to detail features, pull-back reveal, smooth dolly from lifestyle to product close-up.",
    lightingPreferences: "Soft three-point studio lighting, rim light for product edge definition, warm practical lighting in lifestyle scenes.",
    pacingNotes: "Measured pacing: product reveal (3s) → features (4s) → lifestyle (4s) → brand outro (2s). Clean transitions.",
  },
  "08-anime-action": {
    id: "08-anime-action",
    label: "Anime Action",
    description: "2D cel-shaded, speed lines, dramatic pose holds.",
    visualStyle: "Cel-shaded 2D animation style, bold outlines, speed lines during motion, impact frames with radiating lines, dramatic pose holds, sakura petals / energy particles, limited animation with key pose emphasis.",
    cameraPreferences: "Dramatic zoom bursts, snap pans between characters, slow orbit during power-up sequences, first-person POV during charge attacks, bird's eye for scale.",
    lightingPreferences: "Dramatic backlighting with bloom, color-coded auras (blue=calm, red=rage, gold=power), screen-tone shading, rim light halos.",
    pacingNotes: "Buildup → freeze → release pattern. Hold dramatic poses for 1-2s. Speed lines crescendo into impact. Reaction cuts between strikes.",
  },
  "09-product-360": {
    id: "09-product-360",
    label: "Product 360°",
    description: "Single-product orbit, studio lighting, no humans.",
    visualStyle: "Minimalist studio environment, infinite sweep background, product perfectly centered, subtle reflection on surface, no humans or text.",
    cameraPreferences: "Smooth continuous 360° orbit, slight tilt variations, occasional push-in to detail, pull-back for full reveal.",
    lightingPreferences: "Soft key with strong rim for edge definition, subtle gradient background, specular highlights on glossy surfaces, matte diffusion on textured surfaces.",
    pacingNotes: "Slow continuous rotation, 1 full revolution per 10-15s. Momentary pauses at key angles showing features.",
  },
  "10-music-video": {
    id: "10-music-video",
    label: "Music Video",
    description: "Beat-matched cuts, performance + B-roll intercuts.",
    visualStyle: "High-saturation colors, neon glow effects, lens flares, smoke/haze atmosphere, stylized color grading per scene (warm performance / cool B-roll).",
    cameraPreferences: "Handheld energy for performance, smooth dolly for B-roll, whip pans on beat drops, slow-motion for emotional moments, Dutch angles for tension.",
    lightingPreferences: "Concert/stage lighting: colored spots, moving heads, strobes on beat drops. Practical neon for B-roll. Silhouette backlighting.",
    pacingNotes: "Every cut on a beat or half-beat. Alternate performance (artist) and B-roll (narrative/visual). Build density toward chorus.",
    defaultBgmIntensity: "peak",
  },
  "11-social-hook": {
    id: "11-social-hook",
    label: "Social Hook",
    description: "Vertical 9:16, first-second pattern interrupt.",
    visualStyle: "Bold, attention-grabbing first frame. High contrast, text overlays, face-forward framing for vertical format. Pop colors, clean backgrounds.",
    cameraPreferences: "Quick zoom-in hook, then stabilize. POV shots, direct-to-camera. Snap transitions. Minimal camera movement — content moves, not camera.",
    lightingPreferences: "Bright, well-lit for mobile screens. Ring light aesthetic for talking heads. Clean shadows.",
    pacingNotes: "Hook in first 1-2s (pattern interrupt). Dense content every 3s. No dead time. End with CTA or cliffhanger.",
    defaultAspectRatio: "9:16",
  },
  "12-brand-story": {
    id: "12-brand-story",
    label: "Brand Story",
    description: "Documentary tone, restrained narration, emotional arc.",
    visualStyle: "Natural, desaturated grade with selective warmth. Real-world textures, authentic environments. Subtle depth of field. Documentary authenticity.",
    cameraPreferences: "Observational camera: long takes, gentle handheld, slow dolly reveals. Intimate close-ups alternating with contextual wides. Minimal overt camera tricks.",
    lightingPreferences: "Natural/available light preferred. Window light for interiors. Golden hour for exteriors. Motivated practical sources.",
    pacingNotes: "Slow, contemplative pacing. Let moments land. Narration-driven rhythm. Build emotional arc: setup → tension → resolution.",
    defaultBgmIntensity: "low",
  },
  "13-fashion-lookbook": {
    id: "13-fashion-lookbook",
    label: "Fashion Lookbook",
    description: "Editorial framing, model walks, cool palette.",
    visualStyle: "Editorial photography aesthetic, desaturated cool palette with selective warm accents, clean negative space, minimalist set design, fabric texture emphasis.",
    cameraPreferences: "Slow tracking alongside model, push-in to fabric detail, pull-back full outfit reveal, elegant dolly movements. Static poses held for editorial frames.",
    lightingPreferences: "Soft diffused key light, strong rim for silhouette definition, colored gels for mood. Studio strobe-like quality.",
    pacingNotes: "Measured, rhythmic cuts. Hold on each look for 3-4s. Intercut detail with full body. Music-driven but not frantic.",
  },
  "14-food-beverage": {
    id: "14-food-beverage",
    label: "Food & Beverage",
    description: "Macro pours, ingredient deconstruction, dewdrops.",
    visualStyle: "Hyper-saturated colors, glistening textures, steam/condensation, macro detail on ingredients, dewdrops on surfaces, slow-motion liquid dynamics.",
    cameraPreferences: "Macro push-in to ingredients, slow-motion pour shots, overhead flat-lay, gentle orbit around plated dish, snap zoom to hero detail.",
    lightingPreferences: "Warm key light from behind/side to catch steam and glistening. Backlight through liquids. Specular highlights on wet surfaces.",
    pacingNotes: "Slow-motion hero moments (pours, drips, sprinkles). Quick cuts for assembly/preparation. End on hero beauty shot held for 2-3s.",
  },
  "15-real-estate": {
    id: "15-real-estate",
    label: "Real Estate",
    description: "Slow drone push-ins, smooth interior dollies.",
    visualStyle: "Clean, bright, aspirational. Warm natural light, wide-angle to show space, staged interiors, blue sky exteriors, green landscaping.",
    cameraPreferences: "Drone establishing shots (slow push-in), smooth low dolly through interiors, pan across rooms, pull-back reveals of open spaces, tilt-up from ground to full facade.",
    lightingPreferences: "Natural daylight, large windows as light sources, warm interior practicals (lamps, pendants), twilight exterior with interior glow.",
    pacingNotes: "Slow, spacious pacing (5-8s per room/angle). Smooth transitions — dissolves or hidden wipes through doorways. Exterior → interior → exterior flow.",
  },
};

export function getStyleDirective(packId: string): StyleDirective | null {
  return STYLE_DIRECTIVES[packId] ?? null;
}

// ---------------------------------------------------------------------------
// Storyboarding grammar — the core system prompt for professional outlines
// ---------------------------------------------------------------------------
export const STORYBOARD_GRAMMAR = `
## Professional Storyboarding Grammar

You are a senior creative director / storyboard artist producing a production-ready shot list.
Each beat must read like a professional storyboard panel — a cinematographer, editor, and sound
designer should be able to execute it without asking questions.

### Beat Types (you MUST use a mix for variety)

| beatType | Purpose | Typical Duration | Example |
|----------|---------|------------------|---------|
| establishing | Sets location, time, mood | 4-6s | Wide drone shot of a village at dawn, mist rising from fields |
| dialogue | Character speaks / narrates | 5-10s | MCU of storyteller by firelight, speaking directly to camera |
| b-roll | Visual texture, atmosphere | 4-6s | Macro shot of oil lamp flame flickering, moths circling |
| action | Movement, physical activity | 4-8s | Character walks through market, camera tracking alongside |
| transition | Visual bridge between scenes | 3-5s | Slow dissolve from temple spire to sunset horizon |
| montage | Rapid visual sequence | 5-8s | Quick cuts: hands weaving, feet dancing, spices grinding |
| reaction | Emotional response, close-up | 3-5s | ECU of character's eyes widening in surprise |
| cutaway | Detail that adds context | 3-5s | Insert shot of letter being sealed with wax |

### RULES FOR EVERY STORYBOARD

1. **Open with an establishing beat** — set the world before introducing characters
2. **Never have 3+ dialogue beats in a row** — intercut with B-roll, reaction, or cutaway
3. **Every dialogue beat needs a preceding or following visual beat** — B-roll or establishing
4. **Scene descriptions must be SPECIFIC** — not "a beautiful scene" but "a crumbling sandstone haveli with faded turquoise shutters, laundry lines between balconies, afternoon light casting long shadows through carved jali screens"
5. **Camera direction must name the exact move** — not "interesting camera" but "slow dolly-in from medium shot to close-up, lens at eye level, f/2.0 shallow DOF blurring the market crowd behind"
6. **Lighting notes must be actionable** — not "nice lighting" but "golden hour sidelight from camera-left, warm 3200K key with blue 5600K fill from the sky, hair light from a practical hanging lantern"
7. **Audio direction is mandatory** — every beat needs explicit sound: ambient beds, SFX hits, music cues, or silence (which is also a choice)
8. **Duration must match content** — a 4s beat can have ONE camera move and ONE action. A 10s beat can have a camera move + character action + dialogue.
9. **B-roll beats carry the production value** — these are your texture shots. Be maximally specific about what the camera sees: materials, colors, movement, scale.
10. **Transitions should be motivated** — match-cut on shape, dissolve on time passage, whip-pan on energy shift.

### Scene Description Formula
Write scene descriptions using this order:
LOCATION + TIME + WEATHER → ENVIRONMENT DETAILS (textures, colors, scale) → PROPS/OBJECTS → CHARACTER PLACEMENT → MOOD/ATMOSPHERE

Example: "Interior of a dimly lit chai stall at dusk — weathered wooden counter with brass samovars steaming, glass jars of cardamom and ginger lined against a peeling blue wall, a single bare bulb casting warm yellow pools. The chai-wallah stands behind the counter, sleeves rolled, pouring from height into small clay cups. Cozy, intimate, the smell of spices almost visible in the humid air."

### Camera Direction Formula
SHOT SIZE + CAMERA MOVE + SPEED + ANGLE + LENS CHARACTER + FOCUS BEHAVIOR

Example: "Medium close-up, slow push-in (2s duration), camera at slight low angle, 85mm equivalent with shallow DOF (f/1.8), focus racks from foreground steam to character's face mid-move."

### Audio Direction Formula
AMBIENT BED + SFX EVENTS + MUSIC CUE + VOICE DIRECTION

Example: "Ambient: bustling market chatter, distant temple bells. SFX: clay cups clinking, liquid pouring. BGM: soft sitar drone at low intensity, building. Voice: warm baritone, measured pace, slight smile in delivery."
`.trim();

// ---------------------------------------------------------------------------
// Atomic element mapping (for the synthesizer's reference strategy)
// ---------------------------------------------------------------------------
export const ATOMIC_ELEMENTS = `
## Reference Strategy for Seedance Prompts

When building the final Seedance prompt from a beat outline, map references like this:

| What you need | How to reference it |
|---------------|-------------------|
| Character identity | @Image1 as the subject (ALWAYS include for consistency) |
| Scene/background | Text description + optional @Image for base environment |
| Aesthetic style | Text description of visual style from the style pack |
| Camera movement | Text (cinematic terms are more precise than reference video) |
| Subject motion | Text for simple actions, @Video for complex choreography |
| Voice timbre | @Audio1 (the canonical voice sample) |
| Background music | Text description of genre, tempo, intensity |
| Sound effects | Text description of specific sounds |

### Building the Prompt
1. Open with subject + scene setup (who, where, when)
2. Describe the action in detail (what happens, moment by moment)
3. Specify camera movement precisely
4. Add time segments if duration > 8s
5. Include audio direction
6. Add style modifiers
7. Close with @references and their explicit roles
8. End with negatives clause
`.trim();
