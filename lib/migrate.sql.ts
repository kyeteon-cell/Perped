/** Idempotent schema, mirrors lib/schema.ts. Run through /api/setup once (and again after schema changes; it only adds). */
export const MIGRATION_SQL = `
create table if not exists users (
  id text primary key,
  address text not null,
  handle text not null,
  bio text,
  avatar_url text,
  x_handle text,
  verified boolean not null default false,
  show_liquidations boolean not null default true,
  show_sizes boolean not null default true,
  allow_copy boolean not null default true,
  allow_fade boolean not null default true,
  show_bottom_board boolean not null default false,
  accept_duels boolean not null default true,
  default_leverage integer not null default 3,
  pnl_display text not null default 'pct',
  is_demo boolean not null default false,
  demo_balance numeric not null default 10000,
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);
alter table users add column if not exists is_demo boolean not null default false;
alter table users add column if not exists demo_balance numeric not null default 10000;
alter table users alter column demo_balance set default 10000;
-- demo balance bump: accounts that never traded (still exactly 1000) move to the new starting balance
update users set demo_balance = 10000 where is_demo and demo_balance = 1000;
alter table users add column if not exists is_bot boolean not null default false;
alter table users add column if not exists referred_by text;
alter table users add column if not exists xp integer not null default 0;
alter table users add column if not exists referred_at timestamptz;
create index if not exists users_referred_by_idx on users (referred_by);
create unique index if not exists users_handle_idx on users (handle);
create unique index if not exists users_address_idx on users (address);

create table if not exists posts (
  id serial primary key,
  user_id text references users(id),
  kind text not null default 'trade',
  body text,
  coin text,
  side text,
  size numeric,
  notional_usd numeric,
  leverage integer,
  entry_px numeric,
  oid integer,
  status text not null default 'open',
  exit_px numeric,
  realized_pnl numeric,
  closed_at timestamptz,
  copied_from_id integer,
  faded_from_id integer,
  tp_px numeric,
  sl_px numeric,
  target_px numeric,
  invalid_px numeric,
  deadline timestamptz,
  call_status text,
  resolved_at timestamptz,
  resolved_px numeric,
  backed_post_id integer,
  options jsonb,
  closes_at timestamptz,
  settle jsonb,
  system_type text,
  meta jsonb,
  pinned boolean not null default false,
  paper boolean not null default false,
  created_at timestamptz not null default now()
);
alter table posts add column if not exists paper boolean not null default false;
create index if not exists posts_created_idx on posts (created_at);
create index if not exists posts_user_idx on posts (user_id);
create index if not exists posts_kind_idx on posts (kind);
create index if not exists posts_coin_idx on posts (coin);

create table if not exists comments (
  id serial primary key,
  post_id integer not null references posts(id) on delete cascade,
  user_id text not null references users(id),
  parent_id integer,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on comments (post_id);

create table if not exists votes (
  post_id integer not null references posts(id) on delete cascade,
  user_id text not null references users(id),
  value integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists votes_unique on votes (post_id, user_id);

create table if not exists poll_votes (
  post_id integer not null references posts(id) on delete cascade,
  user_id text not null references users(id),
  option integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists poll_votes_unique on poll_votes (post_id, user_id);

create table if not exists follows (
  follower_id text not null references users(id),
  followee_id text not null references users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists follows_unique on follows (follower_id, followee_id);

create table if not exists duels (
  id serial primary key,
  challenger_id text not null references users(id),
  opponent_id text not null references users(id),
  coin text not null,
  challenger_side text not null,
  stake_usd numeric not null,
  status text not null default 'pending',
  challenger_post_id integer,
  opponent_post_id integer,
  settles_at timestamptz not null,
  winner_id text,
  start_px numeric,
  end_px numeric,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id serial primary key,
  user_id text not null references users(id),
  type text not null,
  title text not null,
  body text,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read);

create table if not exists stats (
  user_id text primary key references users(id),
  realized_pnl_7d numeric not null default 0,
  realized_pnl_30d numeric not null default 0,
  realized_pnl_all numeric not null default 0,
  win_rate numeric not null default 0,
  closed_trades integer not null default 0,
  volume_30d numeric not null default 0,
  liquidations integer not null default 0,
  calls_resolved integer not null default 0,
  calls_hit integer not null default 0,
  call_avg_move numeric not null default 0,
  call_streak integer not null default 0,
  judgement numeric not null default 0,
  copied_count integer not null default 0,
  faded_count integer not null default 0,
  rank_30d integer,
  updated_at timestamptz not null default now()
);
alter table stats add column if not exists rank_30d integer;
alter table stats add column if not exists battles_won integer not null default 0;
alter table stats add column if not exists battles_lost integer not null default 0;

create table if not exists battles (
  id serial primary key,
  fader_post_id integer not null unique,
  target_post_id integer not null,
  fader_id text not null references users(id),
  target_id text not null references users(id),
  coin text not null,
  status text not null default 'open',
  winner_id text,
  fader_roi numeric,
  target_roi numeric,
  reason text,
  xp_fader integer,
  xp_target integer,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists battles_status_idx on battles (status);
create index if not exists battles_fader_idx on battles (fader_id);
create index if not exists battles_target_idx on battles (target_id);

create table if not exists xp_log (
  id serial primary key,
  user_id text not null references users(id),
  delta integer not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists xp_log_user_idx on xp_log (user_id, created_at);

create table if not exists referral_earnings (
  id serial primary key,
  referrer_id text not null references users(id),
  referee_id text not null references users(id),
  day text not null,
  fills integer not null default 0,
  volume_usd numeric not null default 0,
  builder_fee_usd numeric not null default 0,
  share_pct numeric not null default 0,
  share_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists referral_earnings_unique on referral_earnings (referee_id, day);
create index if not exists referral_earnings_referrer_idx on referral_earnings (referrer_id);

create table if not exists referral_payouts (
  id serial primary key,
  referrer_id text not null references users(id),
  amount_usd numeric not null,
  tx_hash text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists referral_payouts_referrer_idx on referral_payouts (referrer_id);
`;
