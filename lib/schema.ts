import { pgTable, text, timestamp, integer, numeric, boolean, index, uniqueIndex, serial, jsonb } from "drizzle-orm/pg-core";

/** One row per Privy user. `address` is their Hyperliquid (EVM) wallet. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // Privy DID
    address: text("address").notNull(),
    handle: text("handle").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    xHandle: text("x_handle"),
    verified: boolean("verified").default(false).notNull(), // 10+ closed trades and a linked X account
    // Settings (consent-based heat)
    showLiquidations: boolean("show_liquidations").default(true).notNull(),
    showSizes: boolean("show_sizes").default(true).notNull(),
    allowCopy: boolean("allow_copy").default(true).notNull(),
    allowFade: boolean("allow_fade").default(true).notNull(),
    showBottomBoard: boolean("show_bottom_board").default(false).notNull(),
    acceptDuels: boolean("accept_duels").default(true).notNull(),
    defaultLeverage: integer("default_leverage").default(3).notNull(),
    pnlDisplay: text("pnl_display", { enum: ["pct", "usd", "roi"] }).default("pct").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_handle_idx").on(t.handle), uniqueIndex("users_address_idx").on(t.address)],
);

export type PostKind = "trade" | "text" | "call" | "poll" | "system";

/**
 * Everything in the feed is a post. `kind` decides which columns matter:
 * trade: coin/side/size/leverage/entryPx (+ exit when closed)
 * text:  body
 * call:  coin, side (long=up/short=down), targetPx, invalidPx, deadline, callStatus
 * poll:  body (question), options (jsonb), closesAt, settle (jsonb {coin, op, px})
 * system: body + systemType (liquidation | milestone | settled | rank | story)
 */
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => users.id), // null for system posts
    kind: text("kind", { enum: ["trade", "text", "call", "poll", "system"] }).default("trade").notNull(),
    body: text("body"),
    // trade / call
    coin: text("coin"),
    side: text("side", { enum: ["long", "short"] }),
    size: numeric("size"),
    notionalUsd: numeric("notional_usd"),
    leverage: integer("leverage"),
    entryPx: numeric("entry_px"),
    oid: integer("oid"),
    status: text("status", { enum: ["open", "closed"] }).default("open").notNull(),
    exitPx: numeric("exit_px"),
    realizedPnl: numeric("realized_pnl"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    copiedFromId: integer("copied_from_id"),
    fadedFromId: integer("faded_from_id"),
    tpPx: numeric("tp_px"),
    slPx: numeric("sl_px"),
    // call
    targetPx: numeric("target_px"),
    invalidPx: numeric("invalid_px"),
    deadline: timestamp("deadline", { withTimezone: true }),
    callStatus: text("call_status", { enum: ["open", "hit", "missed"] }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedPx: numeric("resolved_px"),
    backedPostId: integer("backed_post_id"),
    // poll
    options: jsonb("options").$type<string[]>(),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    settle: jsonb("settle").$type<{ coin: string; op: "gte" | "lte"; px: number; winner?: number } | null>(),
    // system
    systemType: text("system_type"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    pinned: boolean("pinned").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("posts_created_idx").on(t.createdAt), index("posts_user_idx").on(t.userId), index("posts_kind_idx").on(t.kind), index("posts_coin_idx").on(t.coin)],
);

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    parentId: integer("parent_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("comments_post_idx").on(t.postId)],
);

/** Like / dislike. One row per user per post; `value` is +1 or -1. On calls this feeds the Judgement score. */
export const votes = pgTable(
  "votes",
  {
    postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    value: integer("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("votes_unique").on(t.postId, t.userId)],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    option: integer("option").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("poll_votes_unique").on(t.postId, t.userId)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id").notNull().references(() => users.id),
    followeeId: text("followee_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("follows_unique").on(t.followerId, t.followeeId)],
);

/** A duel: two traders, same coin, opposite sides (or same side vs a target), settled on price at `settlesAt`. No spectator stakes. */
export const duels = pgTable("duels", {
  id: serial("id").primaryKey(),
  challengerId: text("challenger_id").notNull().references(() => users.id),
  opponentId: text("opponent_id").notNull().references(() => users.id),
  coin: text("coin").notNull(),
  challengerSide: text("challenger_side", { enum: ["long", "short"] }).notNull(),
  stakeUsd: numeric("stake_usd").notNull(), // each trader's own position size, nothing else
  status: text("status", { enum: ["pending", "live", "settled", "declined"] }).default("pending").notNull(),
  challengerPostId: integer("challenger_post_id"),
  opponentPostId: integer("opponent_post_id"),
  settlesAt: timestamp("settles_at", { withTimezone: true }).notNull(),
  winnerId: text("winner_id"),
  startPx: numeric("start_px"),
  endPx: numeric("end_px"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type").notNull(), // copied | faded | call_hit | call_missed | stop | tp | follow | rank | reply | duel | settled
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.read)],
);

/** Cached per-user stats, refreshed from Hyperliquid fills + our tables by /api/cron/stats. */
export const stats = pgTable("stats", {
  userId: text("user_id").primaryKey().references(() => users.id),
  realizedPnl7d: numeric("realized_pnl_7d").default("0").notNull(),
  realizedPnl30d: numeric("realized_pnl_30d").default("0").notNull(),
  realizedPnlAll: numeric("realized_pnl_all").default("0").notNull(),
  winRate: numeric("win_rate").default("0").notNull(),
  closedTrades: integer("closed_trades").default(0).notNull(),
  volume30d: numeric("volume_30d").default("0").notNull(),
  liquidations: integer("liquidations").default(0).notNull(),
  callsResolved: integer("calls_resolved").default(0).notNull(),
  callsHit: integer("calls_hit").default(0).notNull(),
  callAvgMove: numeric("call_avg_move").default("0").notNull(),
  callStreak: integer("call_streak").default(0).notNull(),
  judgement: numeric("judgement").default("0").notNull(), // % of the user's votes on calls that were on the right side
  copiedCount: integer("copied_count").default(0).notNull(),
  fadedCount: integer("faded_count").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Stats = typeof stats.$inferSelect;
export type Duel = typeof duels.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
