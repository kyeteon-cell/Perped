import { pgTable, text, timestamp, integer, numeric, boolean, index, uniqueIndex, serial } from "drizzle-orm/pg-core";

/** One row per Privy user. `address` is their Hyperliquid (EVM) wallet. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // Privy DID
    address: text("address").notNull(),
    handle: text("handle").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_handle_idx").on(t.handle), uniqueIndex("users_address_idx").on(t.address)],
);

/** A trade placed through Perped. Every open trade is a post in the feed. */
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    coin: text("coin").notNull(),
    side: text("side", { enum: ["long", "short"] }).notNull(),
    size: numeric("size").notNull(), // coin units
    notionalUsd: numeric("notional_usd").notNull(),
    leverage: integer("leverage").notNull(),
    entryPx: numeric("entry_px").notNull(),
    oid: integer("oid"),
    caption: text("caption"),
    status: text("status", { enum: ["open", "closed"] }).default("open").notNull(),
    exitPx: numeric("exit_px"),
    realizedPnl: numeric("realized_pnl"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    copiedFromId: integer("copied_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("posts_created_idx").on(t.createdAt), index("posts_user_idx").on(t.userId)],
);

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("comments_post_idx").on(t.postId)],
);

export const reactions = pgTable(
  "reactions",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: ["fire", "skull", "ape"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("reactions_unique").on(t.postId, t.userId, t.kind)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id),
    followeeId: text("followee_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("follows_unique").on(t.followerId, t.followeeId)],
);

/** Cached per-user stats, refreshed from Hyperliquid fills by /api/cron/stats. */
export const stats = pgTable("stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  realizedPnl7d: numeric("realized_pnl_7d").default("0").notNull(),
  realizedPnl30d: numeric("realized_pnl_30d").default("0").notNull(),
  realizedPnlAll: numeric("realized_pnl_all").default("0").notNull(),
  winRate: numeric("win_rate").default("0").notNull(),
  closedTrades: integer("closed_trades").default(0).notNull(),
  volume30d: numeric("volume_30d").default("0").notNull(),
  verified: boolean("verified").default(true).notNull(), // stats come straight from chain
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Stats = typeof stats.$inferSelect;
