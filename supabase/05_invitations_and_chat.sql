-- =====================================================================
-- 05_invitations_and_chat.sql
-- 邀请记录表 + 项目聊天消息表
-- =====================================================================

-- ① 邀请记录
create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email   text not null,
  assigned_role   text not null check (assigned_role in ('translator','reviewer')),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined','expired')),
  token           text not null unique,
  created_at      timestamptz default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles(id)
);

create index if not exists invitations_project_idx on public.invitations(project_id);
create index if not exists invitations_email_idx on public.invitations(invitee_email);
create index if not exists invitations_token_idx on public.invitations(token);
create index if not exists invitations_status_idx on public.invitations(status);

-- ② 项目聊天消息
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (length(content) > 0 and length(content) <= 4000),
  created_at  timestamptz default now()
);

create index if not exists chat_messages_project_time_idx
  on public.chat_messages(project_id, created_at desc);

-- ③ 开启 Realtime（前端订阅 INSERT 事件）
alter publication supabase_realtime add table public.chat_messages;
