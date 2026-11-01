// Badges shown next to names. Rename a badge here and it changes everywhere in the app.
export const BADGES = {
  admin: { label: "Admin", title: "Perped team" },
  /** The founder programme's public name is still being decided: change `label` here when it is. */
  founder: { label: "OG", title: "One of Perped's first hand-picked traders" },
} as const;

export type BadgeUser = { role?: string | null; founderSeat?: number | null; founderStatus?: string | null };
export const isAdminBadge = (u: BadgeUser) => u.role === "admin" || u.role === "owner";
export const isFounderBadge = (u: BadgeUser) => u.founderSeat != null && u.founderStatus !== "expired";
