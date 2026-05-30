-- =====================================================================
-- 40_term_learning.sql
-- 词条学习：公共分类、公共词条、用户词条本与复习记录。
-- =====================================================================

create table if not exists public.term_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.public_terms (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.term_categories(id) on delete cascade,
  source_text text not null,
  target_text text not null,
  definition text,
  example_sentence text,
  tags text[],
  source text,
  difficulty text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_termbook_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_term_id uuid references public.public_terms(id) on delete set null,
  source_text text not null,
  target_text text not null,
  definition text,
  example_sentence text,
  personal_note text,
  personal_tags text[],
  mastery_status text default 'new'
    check (mastery_status in ('new', 'learning', 'mastered')),
  review_count int default 0
    check (review_count >= 0),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.term_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  termbook_item_id uuid references public.user_termbook_items(id) on delete cascade,
  result text
    check (result in ('known', 'unsure', 'forgotten')),
  reviewed_at timestamptz default now()
);

create index if not exists term_categories_sort_idx
  on public.term_categories(sort_order, name);

create index if not exists public_terms_category_created_idx
  on public.public_terms(category_id, created_at desc);

create index if not exists public_terms_tags_idx
  on public.public_terms using gin(tags);

create index if not exists user_termbook_items_user_created_idx
  on public.user_termbook_items(user_id, created_at desc);

create index if not exists user_termbook_items_user_next_review_idx
  on public.user_termbook_items(user_id, next_review_at)
  where next_review_at is not null;

create index if not exists term_review_logs_user_reviewed_idx
  on public.term_review_logs(user_id, reviewed_at desc);

drop trigger if exists term_categories_touch on public.term_categories;
create trigger term_categories_touch
  before update on public.term_categories
  for each row execute function public.touch_updated_at();

drop trigger if exists public_terms_touch on public.public_terms;
create trigger public_terms_touch
  before update on public.public_terms
  for each row execute function public.touch_updated_at();

drop trigger if exists user_termbook_items_touch on public.user_termbook_items;
create trigger user_termbook_items_touch
  before update on public.user_termbook_items
  for each row execute function public.touch_updated_at();

alter table public.term_categories enable row level security;
alter table public.public_terms enable row level security;
alter table public.user_termbook_items enable row level security;
alter table public.term_review_logs enable row level security;

drop policy if exists term_categories_authenticated_select on public.term_categories;
create policy term_categories_authenticated_select on public.term_categories
  for select
  to authenticated
  using (true);

drop policy if exists term_categories_admin_insert on public.term_categories;
create policy term_categories_admin_insert on public.term_categories
  for insert
  to authenticated
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists term_categories_admin_update on public.term_categories;
create policy term_categories_admin_update on public.term_categories
  for update
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists term_categories_admin_delete on public.term_categories;
create policy term_categories_admin_delete on public.term_categories
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists public_terms_authenticated_select on public.public_terms;
create policy public_terms_authenticated_select on public.public_terms
  for select
  to authenticated
  using (true);

drop policy if exists public_terms_admin_insert on public.public_terms;
create policy public_terms_admin_insert on public.public_terms
  for insert
  to authenticated
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists public_terms_admin_update on public.public_terms;
create policy public_terms_admin_update on public.public_terms
  for update
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists public_terms_admin_delete on public.public_terms;
create policy public_terms_admin_delete on public.public_terms
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists user_termbook_items_own_select on public.user_termbook_items;
create policy user_termbook_items_own_select on public.user_termbook_items
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_termbook_items_own_insert on public.user_termbook_items;
create policy user_termbook_items_own_insert on public.user_termbook_items
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_termbook_items_own_update on public.user_termbook_items;
create policy user_termbook_items_own_update on public.user_termbook_items
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_termbook_items_own_delete on public.user_termbook_items;
create policy user_termbook_items_own_delete on public.user_termbook_items
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists term_review_logs_own_select on public.term_review_logs;
create policy term_review_logs_own_select on public.term_review_logs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists term_review_logs_own_insert on public.term_review_logs;
create policy term_review_logs_own_insert on public.term_review_logs
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      termbook_item_id is null
      or exists (
        select 1
        from public.user_termbook_items item
        where item.id = termbook_item_id
          and item.user_id = auth.uid()
      )
    )
  );

grant select, insert, update, delete on public.term_categories to authenticated;
grant select, insert, update, delete on public.public_terms to authenticated;
grant select, insert, update, delete on public.user_termbook_items to authenticated;
grant select, insert on public.term_review_logs to authenticated;

with seed_categories(name, sort_order) as (
  values
    ('大会热词', 10),
    ('国际组织', 20),
    ('经济词条', 30),
    ('法律词条', 40),
    ('社会热词', 50),
    ('科技热词', 60),
    ('其他', 70)
)
insert into public.term_categories (name, sort_order)
select seed.name, seed.sort_order
from seed_categories seed
where not exists (
  select 1
  from public.term_categories category
  where category.name = seed.name
);

with seed_terms(
  category_name,
  source_text,
  target_text,
  definition,
  example_sentence,
  tags,
  source,
  difficulty
) as (
  values
    (
      '大会热词',
      '高质量发展',
      'high-quality development',
      '强调质量、效率和可持续性并重的发展路径。',
      '高质量发展需要更强的创新能力和更稳定的产业基础。',
      array['发展', '政策'],
      'seed',
      'basic'
    ),
    (
      '大会热词',
      '中国式现代化',
      'Chinese modernization',
      '结合中国国情推进现代化建设的表达。',
      '中国式现代化强调发展成果由人民共享。',
      array['现代化', '治理'],
      'seed',
      'intermediate'
    ),
    (
      '大会热词',
      '绿色转型',
      'green transition',
      '从高耗能模式转向低碳、环保和可持续模式的过程。',
      '绿色转型正在改变能源、交通和制造业的发展方式。',
      array['环境', '发展'],
      'seed',
      'basic'
    ),
    (
      '国际组织',
      '联合国',
      'United Nations',
      '致力于国际和平、安全与合作的政府间组织。',
      '联合国在全球治理中发挥重要协调作用。',
      array['国际组织', '外交'],
      'seed',
      'basic'
    ),
    (
      '国际组织',
      '世界卫生组织',
      'World Health Organization',
      '负责国际公共卫生事务协调的联合国专门机构。',
      '世界卫生组织发布了新的公共卫生建议。',
      array['国际组织', '公共卫生'],
      'seed',
      'basic'
    ),
    (
      '国际组织',
      '亚太经合组织',
      'Asia-Pacific Economic Cooperation',
      '推动亚太地区经济合作与贸易便利化的机制。',
      '亚太经合组织成员讨论了区域经济复苏议题。',
      array['国际组织', '经济'],
      'seed',
      'intermediate'
    ),
    (
      '经济词条',
      '供应链韧性',
      'supply chain resilience',
      '供应链应对冲击、恢复运转并保持稳定的能力。',
      '企业正在通过多元采购提升供应链韧性。',
      array['经济', '产业'],
      'seed',
      'intermediate'
    ),
    (
      '经济词条',
      '数字经济',
      'digital economy',
      '以数据资源和数字技术为关键要素的经济形态。',
      '数字经济为服务贸易创造了新的增长空间。',
      array['经济', '科技'],
      'seed',
      'basic'
    ),
    (
      '经济词条',
      '普惠金融',
      'inclusive finance',
      '面向更多群体提供可负担、可获得金融服务的理念。',
      '普惠金融有助于小微企业获得稳定融资。',
      array['经济', '金融'],
      'seed',
      'intermediate'
    ),
    (
      '法律词条',
      '法治',
      'rule of law',
      '以法律为基础治理国家和社会事务的原则。',
      '法治建设需要透明、公正和可预期的制度环境。',
      array['法律', '治理'],
      'seed',
      'basic'
    ),
    (
      '法律词条',
      '知识产权保护',
      'intellectual property protection',
      '保护创新成果、作品和商业标识等权利的制度安排。',
      '加强知识产权保护可以激励企业持续创新。',
      array['法律', '创新'],
      'seed',
      'intermediate'
    ),
    (
      '法律词条',
      '合规管理',
      'compliance management',
      '组织识别、预防和控制法律及规则风险的管理活动。',
      '跨国企业通常建立专门团队负责合规管理。',
      array['法律', '企业'],
      'seed',
      'intermediate'
    ),
    (
      '社会热词',
      '基层治理',
      'community-level governance',
      '面向社区、乡镇等基层单位的公共事务治理。',
      '基层治理能力直接影响公共服务的实际效果。',
      array['社会', '治理'],
      'seed',
      'intermediate'
    ),
    (
      '社会热词',
      '共同富裕',
      'common prosperity',
      '在发展中促进机会公平和成果共享的社会目标。',
      '共同富裕需要兼顾效率与公平。',
      array['社会', '发展'],
      'seed',
      'intermediate'
    ),
    (
      '社会热词',
      '灵活就业',
      'flexible employment',
      '不完全依赖固定工作场所和固定工时的就业形态。',
      '数字平台扩大了灵活就业的机会。',
      array['社会', '就业'],
      'seed',
      'basic'
    ),
    (
      '科技热词',
      '人工智能治理',
      'AI governance',
      '围绕人工智能研发、部署和应用建立规则与责任机制。',
      '人工智能治理需要兼顾创新、安全和伦理。',
      array['科技', '治理'],
      'seed',
      'intermediate'
    ),
    (
      '科技热词',
      '数据安全',
      'data security',
      '保护数据免受泄露、篡改、滥用和非法访问的措施。',
      '数据安全是数字化转型中的核心议题。',
      array['科技', '安全'],
      'seed',
      'basic'
    ),
    (
      '科技热词',
      '量子计算',
      'quantum computing',
      '利用量子力学原理进行信息处理的计算方式。',
      '量子计算可能在特定复杂问题上带来效率突破。',
      array['科技', '计算'],
      'seed',
      'advanced'
    ),
    (
      '其他',
      '跨文化交流',
      'cross-cultural communication',
      '不同文化背景群体之间的信息交换与理解过程。',
      '跨文化交流能力是翻译实践的重要基础。',
      array['文化', '翻译'],
      'seed',
      'basic'
    ),
    (
      '其他',
      '可持续发展',
      'sustainable development',
      '兼顾经济、社会和环境长期需求的发展方式。',
      '可持续发展要求在增长和保护之间取得平衡。',
      array['发展', '环境'],
      'seed',
      'basic'
    ),
    (
      '其他',
      '应急管理',
      'emergency management',
      '预防、应对和恢复突发事件的组织与协调活动。',
      '完善应急管理机制可以降低突发事件造成的损失。',
      array['治理', '公共安全'],
      'seed',
      'intermediate'
    )
)
insert into public.public_terms (
  category_id,
  source_text,
  target_text,
  definition,
  example_sentence,
  tags,
  source,
  difficulty
)
select
  category.id,
  seed.source_text,
  seed.target_text,
  seed.definition,
  seed.example_sentence,
  seed.tags,
  seed.source,
  seed.difficulty
from seed_terms seed
join public.term_categories category
  on category.name = seed.category_name
where not exists (
  select 1
  from public.public_terms term
  where term.category_id = category.id
    and term.source_text = seed.source_text
    and term.target_text = seed.target_text
);

notify pgrst, 'reload schema';
