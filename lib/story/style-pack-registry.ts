/**
 * 16 theme entries: `auto` + the 15 style packs.
 *
 * Pure data + heuristic — no fs imports. Safe to import in client components.
 * Style pack prompt knowledge is in `prompt-library.ts` (STYLE_DIRECTIVES).
 */
import type { AspectRatio } from "@/lib/constants";
import type { BgmIntensity } from "./types";

export interface StylePack {
  id: string;
  label: string;
  description: string;
  defaultAspectRatio?: AspectRatio;
  defaultBgmIntensity?: BgmIntensity;
}

export const STYLE_PACKS: readonly StylePack[] = [
  {
    id: "auto",
    label: "Auto",
    description: "Let Gemini pick the closest pack from your prompt.",
  },
  {
    id: "01-cinematic",
    label: "Cinematic",
    description: "Wide aspect, shallow DOF, film grain, slow camera moves.",
    defaultBgmIntensity: "mid",
  },
  {
    id: "02-3d-cgi",
    label: "3D / CGI",
    description: "Volumetric lighting, ray-traced reflections, stylized geometry.",
  },
  {
    id: "03-cartoon",
    label: "Cartoon",
    description: "Flat shading, bouncy timing, bold outlines.",
  },
  {
    id: "04-comic-to-video",
    label: "Comic to Video",
    description: "Panel-frame transitions, halftone shading, motion bursts.",
  },
  {
    id: "05-fight-scenes",
    label: "Fight / Action",
    description: "Whip pans, impact frames, slow-mo punctuation.",
    defaultBgmIntensity: "peak",
  },
  {
    id: "06-motion-design-ad",
    label: "Motion Design Ad",
    description: "Kinetic typography, geometric transitions, beat-synced cuts.",
  },
  {
    id: "07-ecommerce-ad",
    label: "E-commerce Ad",
    description: "Product hero rotations, lifestyle context.",
  },
  {
    id: "08-anime-action",
    label: "Anime Action",
    description: "2D cel-shaded, speed lines, dramatic pose holds.",
  },
  {
    id: "09-product-360",
    label: "Product 360°",
    description: "Single-product orbit, studio lighting, no humans.",
  },
  {
    id: "10-music-video",
    label: "Music Video",
    description: "Beat-matched cuts, performance + B-roll.",
    defaultBgmIntensity: "peak",
  },
  {
    id: "11-social-hook",
    label: "Social Hook",
    description: "Vertical 9:16, first-second pattern interrupt.",
    defaultAspectRatio: "9:16",
  },
  {
    id: "12-brand-story",
    label: "Brand Story",
    description: "Documentary tone, restrained narration, emotional arc.",
    defaultBgmIntensity: "low",
  },
  {
    id: "13-fashion-lookbook",
    label: "Fashion Lookbook",
    description: "Editorial framing, model walks, cool palette.",
  },
  {
    id: "14-food-beverage",
    label: "Food & Beverage",
    description: "Macro pours, ingredient deconstruction, dewdrops.",
  },
  {
    id: "15-real-estate",
    label: "Real Estate",
    description: "Slow drone push-ins, smooth interior dollies.",
  },
];

const HEURISTIC_RULES: Array<{ keywords: string[]; pack: string }> = [
  { keywords: ["dance", "music", "song", "beat", "rhythm"], pack: "10-music-video" },
  { keywords: ["food", "burger", "drink", "cocktail", "dish", "meal"], pack: "14-food-beverage" },
  { keywords: ["real estate", "property", "house tour", "apartment"], pack: "15-real-estate" },
  { keywords: ["fashion", "lookbook", "model walk", "runway"], pack: "13-fashion-lookbook" },
  { keywords: ["product", "showcase", "deconstruct", "rotating"], pack: "09-product-360" },
  { keywords: ["fight", "punch", "kick", "battle", "combat"], pack: "05-fight-scenes" },
  { keywords: ["anime", "manga"], pack: "08-anime-action" },
  { keywords: ["cartoon", "kids", "animation"], pack: "03-cartoon" },
  { keywords: ["comic", "panel", "halftone"], pack: "04-comic-to-video" },
  { keywords: ["3d", "cgi", "render"], pack: "02-3d-cgi" },
  { keywords: ["motion design", "kinetic typo", "lower third"], pack: "06-motion-design-ad" },
  { keywords: ["ecommerce", "ad", "shopping"], pack: "07-ecommerce-ad" },
  { keywords: ["social", "tiktok", "reel", "vertical", "9:16"], pack: "11-social-hook" },
  { keywords: ["brand", "documentary", "storytelling"], pack: "12-brand-story" },
];

export interface AssetHints {
  imageCount?: number;
  videoCount?: number;
  audioCount?: number;
}

export function pickAutoStylePack(prompt: string, _hints: AssetHints): string {
  const lc = prompt.toLowerCase();
  for (const rule of HEURISTIC_RULES) {
    if (rule.keywords.some((k) => lc.includes(k))) return rule.pack;
  }
  return "01-cinematic";
}

