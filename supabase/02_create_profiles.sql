-- =====================================================================
-- 02_create_profiles.sql
-- 用户资料镜像表（auth.users 的扩展，存姓名/头像等）
-- 作用：方便前端按 user_id JOIN 显示用户信息，无需调 admin API
-- =====================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 触发器：用户注册时自动写入 profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 回填：把现有 auth.users 写入 profiles（一次性）
insert into public.profiles (id, email, name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- 索引
create index if not exists profiles_email_idx on public.profiles(email);
