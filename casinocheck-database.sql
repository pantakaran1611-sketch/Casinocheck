-- CasinoCheck Phase 2 — run this entire file in Supabase SQL Editor.
-- Public users can read published games and submit pending reviews.
-- Only the account explicitly promoted to admin in step 4 can manage games/reviews.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null default 'Other',
  developer text,
  website_url text,
  short_description text not null,
  full_description text,
  icon text not null default '🎮',
  status text not null default 'published' check (status in ('draft','published','archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 20 and 700),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderator_note text,
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  unique (game_id, user_id)
);

create index if not exists games_status_idx on public.games(status);
create index if not exists reviews_game_status_idx on public.reviews(game_id, status);
create index if not exists reviews_user_idx on public.reviews(user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles update own display name" on public.profiles;
create policy "profiles update own display name" on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()) and role = 'user');

-- No public insert/update/delete policy on games: only admins manage directory entries.
drop policy if exists "published games are public" on public.games;
create policy "published games are public" on public.games
for select to anon, authenticated
using (status = 'published' or public.is_admin());

drop policy if exists "admins manage games" on public.games;
create policy "admins manage games" on public.games
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public visitors see only approved reviews. Signed-in users can submit their own pending review.
drop policy if exists "approved reviews public" on public.reviews;
create policy "approved reviews public" on public.reviews
for select to anon, authenticated
using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "signed in users submit pending reviews" on public.reviews;
create policy "signed in users submit pending reviews" on public.reviews
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and moderated_at is null
  and moderator_note is null
);

drop policy if exists "admins moderate reviews" on public.reviews;
create policy "admins moderate reviews" on public.reviews
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Optional starter content: clearly marked fictional examples, not endorsements.
insert into public.games (slug,name,category,short_description,full_description,icon,is_demo,status)
values
('golden-garden-demo','Golden Garden (Demo)','Social arcade','Fictional sample listing used to demonstrate CasinoCheck.','This is invented demo content. It is not an actual game review or endorsement. Replace only after independent research.','🎡',true,'published'),
('moonlight-quest-demo','Moonlight Quest (Demo)','Adventure','Fictional sample listing used to demonstrate CasinoCheck.','This is invented demo content. It is not an actual game review or endorsement. Replace only after independent research.','🌙',true,'published'),
('puzzle-grove-demo','Puzzle Grove (Demo)','Puzzle','Fictional sample listing used to demonstrate CasinoCheck.','This is invented demo content. It is not an actual game review or endorsement. Replace only after independent research.','🧩',true,'published')
on conflict (slug) do nothing;

-- IMPORTANT ADMIN BOOTSTRAP:
-- 1) Sign up once through CasinoCheck using the email you personally control.
-- 2) In Supabase SQL Editor, run the following after replacing the email:
-- update public.profiles p set role = 'admin'
-- from auth.users u where p.id = u.id and lower(u.email) = lower('YOUR-EMAIL@example.com');
-- Never expose a service_role key in browser code. Do not make a public admin-signup page.
