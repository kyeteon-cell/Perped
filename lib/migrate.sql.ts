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
alter table users add column if not exists banner_url text;
create table if not exists user_media (
  user_id text not null references users(id),
  kind text not null,
  mime text not null,
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
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

create table if not exists rivalries (
  id serial primary key,
  user_a text not null references users(id),
  user_b text not null references users(id),
  a_wins integer not null default 0,
  b_wins integer not null default 0,
  draws integer not null default 0,
  fights integer not null default 0,
  run_holder text,
  run_len integer not null default 0,
  best_run_holder text,
  best_run integer not null default 0,
  active boolean not null default false,
  called_by text,
  muted_a boolean not null default false,
  muted_b boolean not null default false,
  last_alert_a timestamptz,
  last_alert_b timestamptz,
  last_fight_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists rivalries_pair on rivalries (user_a, user_b);
create index if not exists rivalries_a on rivalries (user_a);
create index if not exists rivalries_b on rivalries (user_b);

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

-- Hyperliquid order ids overflow 32-bit ints.
alter table posts alter column oid type bigint;
-- Feed copy/fade counts, battle lookups and follower counts.
create index if not exists posts_copied_from_idx on posts (copied_from_id) where copied_from_id is not null;
create index if not exists posts_faded_from_idx on posts (faded_from_id) where faded_from_id is not null;
create index if not exists posts_kind_status_idx on posts (kind, status);
create index if not exists follows_followee_idx on follows (followee_id);
create index if not exists battles_target_post_idx on battles (target_post_id);
create index if not exists battles_status_idx on battles (status);
alter table users add column if not exists signup_ip text;
create index if not exists users_signup_ip_idx on users (signup_ip, created_at) where signup_ip is not null;
create table if not exists push_subs (
  id serial primary key,
  user_id text not null references users(id),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists push_subs_endpoint on push_subs (endpoint);
create index if not exists push_subs_user on push_subs (user_id);
create table if not exists events (
  id serial primary key,
  name text not null,
  anon text,
  user_id text,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time on events (name, created_at);
-- No emoji in app text: clean what bots and the system already wrote.
update comments set body = btrim(regexp_replace(body, '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]\\uFE0F?\\s?', '', 'g')) where body ~ '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]' and user_id in (select id from users where is_bot);
update posts set body = btrim(regexp_replace(body, '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]\\uFE0F?\\s?', '', 'g')) where body ~ '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]' and (kind = 'system' or user_id in (select id from users where is_bot));
update notifications set title = btrim(regexp_replace(title, '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]\\uFE0F?\\s?', '', 'g')), body = btrim(regexp_replace(coalesce(body, ''), '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]\\uFE0F?\\s?', '', 'g')) where title ~ '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]' or body ~ '[\\U0001F300-\\U0001FAFF\\u2600-\\u26FF]';

-- Invite programme: roles, founders, going-live gate, waitlist, handle redirects, earnings by kind.
alter table users add column if not exists role text not null default 'user';
alter table users add column if not exists founder_seat integer;
alter table users add column if not exists founder_since timestamptz;
alter table users add column if not exists founder_status text;
alter table users add column if not exists can_go_live boolean;
update users set can_go_live = true where can_go_live is null;
alter table users alter column can_go_live set default false;
alter table users add column if not exists waitlist_at timestamptz;
create unique index if not exists users_founder_seat_idx on users (founder_seat) where founder_seat is not null;
create index if not exists users_waitlist_idx on users (waitlist_at) where waitlist_at is not null;
update users set role = 'owner' where handle = 'kilo2' and not exists (select 1 from users o where o.role = 'owner');
create table if not exists handle_redirects (
  old_handle text primary key,
  user_id text not null references users(id),
  created_at timestamptz not null default now()
);
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values ('waitlist', '{"batch":200,"paused":false}') on conflict (key) do nothing;
alter table referral_earnings add column if not exists kind text not null default 'invite';
drop index if exists referral_earnings_unique;
create unique index if not exists referral_earnings_unique2 on referral_earnings (referee_id, day, referrer_id, kind);
create index if not exists comments_user_created_idx on comments (user_id, created_at);
create table if not exists account_links (
  privy_id text primary key,
  user_id text not null references users(id),
  created_at timestamptz not null default now()
);
-- Earnings: trades placed on someone's call.
create index if not exists posts_backed_idx on posts (backed_post_id) where backed_post_id is not null;
`;
