-- 给句段表加 notes 列：译者备注、处理说明等
alter table public.segments
  add column if not exists notes text not null default '';
