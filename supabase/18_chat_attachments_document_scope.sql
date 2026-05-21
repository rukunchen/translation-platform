-- =====================================================================
-- 18_chat_attachments_document_scope.sql
-- Project/task chat attachments.
-- Chat is now project/task-scoped: project page and document pages share
-- the same chat history for later full-task export.
-- =====================================================================

alter table public.chat_messages
  add column if not exists document_id uuid references public.documents(id) on delete cascade,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

create index if not exists chat_messages_project_document_time_idx
  on public.chat_messages(project_id, document_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  15728640,
  array[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
