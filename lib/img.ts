/** A resized copy of one of our own images through Next's image optimiser (cached at the edge). Widths must be Next defaults. */
export type ImgW = 32 | 48 | 64 | 96 | 128 | 256 | 384 | 640 | 828 | 1080;
export const small = (src: string, w: ImgW, q = 75) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
/** Smallest default width that still looks sharp at `px` CSS pixels on a 2× screen. */
export const fit = (px: number): ImgW => ([32, 48, 64, 96, 128, 256, 384] as const).find((w) => w >= px * 2) ?? 384;
