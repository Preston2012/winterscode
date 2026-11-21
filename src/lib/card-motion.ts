/**
 * Which work card art moves, and how. S339, Preston 2026-11-21: "why did we
 * cut the animation on the showcases?" The motions were drawn for each
 * client's own mark (CardMotion.astro, PaintPour.astro); this list lets Home,
 * Work and the case studies all play them on the same art.
 */
export type CardMotionKind = 'lighthouse' | 'flag' | 'lawn' | 'pins';
export const CARD_MOTION: Record<string, { motion?: CardMotionKind; pour?: boolean }> = {
  'grand-management': { motion: 'pins' },
  'us-survey-supply': { motion: 'flag' },
  'makai-painting': { pour: true },
  seabreeze: { motion: 'lawn' },
  'bandon-by-the-dunes': { motion: 'lighthouse' },
};
