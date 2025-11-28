-- users: хранит telegram id, username, имя
create table if not exists public.users (
  id bigint primary key,
  username text,
  full_name text,
  created_at timestamp with time zone default now()
);

-- subscriptions: хранит статус подписки
create table if not exists public.subscriptions (
  id bigserial primary key,
  user_id bigint references public.users(id),
  active boolean default false,
  plan text,
  started_at timestamp with time zone,
  expires_at timestamp with time zone
);

-- soil_results: хранит результаты анализа почвы
create table if not exists public.soil_results (
  id bigserial primary key,
  user_id bigint references public.users(id),
  region text,
  values jsonb,
  created_at timestamp with time zone default now()
);
