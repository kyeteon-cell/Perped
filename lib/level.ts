/** How much someone knows about crypto, picked on first open. Drives explanations and default leverage. */
export type Level = "new" | "crypto" | "perps";
export const LEVEL_KEY = "perped:level";
export function getLevel(): Level | null { try { return (localStorage.getItem(LEVEL_KEY) as Level | null) ?? null; } catch { return null; } }
