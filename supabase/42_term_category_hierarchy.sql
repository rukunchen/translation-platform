-- =====================================================================
-- 42_term_category_hierarchy.sql
-- Add hierarchy metadata for term categories.
-- =====================================================================

alter table public.term_categories
  add column if not exists parent_id uuid references public.term_categories(id) on delete set null,
  add column if not exists level int default 1,
  add column if not exists color text,
  add column if not exists icon text,
  add column if not exists group_key text,
  add column if not exists is_featured boolean default false;

create index if not exists term_categories_parent_sort_idx
  on public.term_categories(parent_id, sort_order, name);

create index if not exists term_categories_group_key_idx
  on public.term_categories(group_key);

update public.term_categories
set
  level = coalesce(level, case when parent_id is null then 1 else 2 end),
  color = coalesce(color, 'gray'),
  is_featured = coalesce(is_featured, false)
where level is null
   or color is null
   or is_featured is null;

insert into public.term_categories (name, description, sort_order, level, color, group_key, is_featured)
select
  '大会热词',
  '大会热词一级分类',
  coalesce((
    select min(sort_order)
    from public.term_categories
    where name like '大会热词（%'
       or name like '大会议热词（%'
  ), 10) - 1,
  1,
  'orange',
  'congress_terms',
  true
where exists (
  select 1
  from public.term_categories
  where name like '大会热词（%'
     or name like '大会议热词（%'
)
and not exists (
  select 1 from public.term_categories where name = '大会热词'
);

insert into public.term_categories (name, description, sort_order, level, color, group_key, is_featured)
select
  '中华思想文化',
  '中华思想文化一级分类',
  coalesce((
    select min(sort_order)
    from public.term_categories
    where name like '中华思想文化（%'
  ), 20) - 1,
  1,
  'purple',
  'chinese_culture',
  true
where exists (
  select 1
  from public.term_categories
  where name like '中华思想文化（%'
)
and not exists (
  select 1 from public.term_categories where name = '中华思想文化'
);

insert into public.term_categories (name, description, sort_order, level, color, group_key, is_featured)
select
  '专题词条',
  '专题词条一级分类',
  coalesce((
    select min(sort_order)
    from public.term_categories
    where name in ('国际组织', '经济词条', '法律词条', '社会热词', '科技热词')
  ), 30) - 1,
  1,
  'cyan',
  'topic_terms',
  true
where exists (
  select 1
  from public.term_categories
  where name in ('国际组织', '经济词条', '法律词条', '社会热词', '科技热词')
)
and not exists (
  select 1 from public.term_categories where name = '专题词条'
);

update public.term_categories
set
  parent_id = null,
  level = 1,
  color = 'orange',
  group_key = 'congress_terms',
  is_featured = true
where name = '大会热词';

update public.term_categories
set
  parent_id = null,
  level = 1,
  color = 'purple',
  group_key = 'chinese_culture',
  is_featured = true
where name = '中华思想文化';

update public.term_categories
set
  parent_id = null,
  level = 1,
  color = 'cyan',
  group_key = 'topic_terms',
  is_featured = true
where name = '专题词条';

with parent as (
  select id
  from public.term_categories
  where name = '大会热词'
  order by sort_order nulls last, created_at nulls last, id
  limit 1
)
update public.term_categories child
set
  parent_id = parent.id,
  level = 2,
  color = 'orange',
  group_key = 'congress_terms',
  is_featured = false
from parent
where child.id <> parent.id
  and (
    child.name like '大会热词（%'
    or child.name like '大会议热词（%'
  );

with parent as (
  select id
  from public.term_categories
  where name = '中华思想文化'
  order by sort_order nulls last, created_at nulls last, id
  limit 1
)
update public.term_categories child
set
  parent_id = parent.id,
  level = 2,
  color = 'purple',
  group_key = 'chinese_culture',
  is_featured = false
from parent
where child.id <> parent.id
  and child.name like '中华思想文化（%';

with parent as (
  select id
  from public.term_categories
  where name = '专题词条'
  order by sort_order nulls last, created_at nulls last, id
  limit 1
)
update public.term_categories child
set
  parent_id = parent.id,
  level = 2,
  color = 'cyan',
  group_key = 'topic_terms',
  is_featured = false
from parent
where child.id <> parent.id
  and child.name in ('国际组织', '经济词条', '法律词条', '社会热词', '科技热词');

update public.term_categories
set
  level = 1,
  color = case
    when name = '国际组织' then 'blue'
    when name = '经济词条' then 'green'
    when name = '法律词条' then 'slate'
    when name = '社会热词' then 'rose'
    when name = '科技热词' then 'cyan'
    else coalesce(color, 'gray')
  end,
  is_featured = coalesce(is_featured, false)
where parent_id is null
  and name not in ('大会热词', '中华思想文化', '专题词条');

update public.term_categories
set level = 2
where parent_id is not null
  and level is distinct from 2;

notify pgrst, 'reload schema';
