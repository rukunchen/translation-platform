-- =====================================================================
-- 27_frontier_literature.sql
-- 前沿文献库 MVP：平台公共文献条目，登录用户可读，唯一管理员可写。
-- =====================================================================

create table if not exists public.frontier_literature_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authors text,
  year int,
  source text,
  region text
    check (region in ('国内', '国外')),
  field text
    check (field in (
      '翻译',
      '翻译科技',
      '语料库',
      '人工智能',
      '心理学',
      '区域国别研究',
      '语言学',
      '教育学',
      '传播学',
      '文学文化',
      '数字人文',
      '其他'
    )),
  method_summary text,
  conclusion_summary text,
  abstract text,
  doi text,
  url text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists frontier_literature_region_idx
  on public.frontier_literature_items(region);

create index if not exists frontier_literature_field_idx
  on public.frontier_literature_items(field);

create index if not exists frontier_literature_year_created_idx
  on public.frontier_literature_items(year desc, created_at desc);

drop trigger if exists frontier_literature_items_touch on public.frontier_literature_items;
create trigger frontier_literature_items_touch
  before update on public.frontier_literature_items
  for each row execute function public.touch_updated_at();

alter table public.frontier_literature_items enable row level security;

drop policy if exists frontier_literature_authenticated_select on public.frontier_literature_items;
create policy frontier_literature_authenticated_select on public.frontier_literature_items
  for select
  to authenticated
  using (true);

drop policy if exists frontier_literature_admin_insert on public.frontier_literature_items;
create policy frontier_literature_admin_insert on public.frontier_literature_items
  for insert
  to authenticated
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists frontier_literature_admin_update on public.frontier_literature_items;
create policy frontier_literature_admin_update on public.frontier_literature_items
  for update
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists frontier_literature_admin_delete on public.frontier_literature_items;
create policy frontier_literature_admin_delete on public.frontier_literature_items
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

grant select on public.frontier_literature_items to authenticated;
grant insert, update, delete on public.frontier_literature_items to authenticated;

insert into public.frontier_literature_items (
  id,
  title,
  authors,
  year,
  source,
  region,
  field,
  method_summary,
  conclusion_summary,
  abstract,
  doi,
  url,
  tags
) values
  (
    '9b94d688-97f5-4c03-97b7-1d5f54af3401',
    '国家翻译能力视域下中国特色话语外译策略研究',
    '李明，周婷',
    2025,
    '中国翻译',
    '国内',
    '翻译',
    '政策文本分析；案例比较',
    '外译质量提升需要把术语一致性、叙事语体和目标读者接受度放在同一评价框架中。',
    '该研究将外宣翻译中的术语、叙事和读者接受度作为联动变量，适合作为政经类材料翻译策略的参考框架。',
    null,
    'https://example.com/frontier/translation-2025-01',
    array['国家翻译能力', '话语外译', '术语一致性']
  ),
  (
    'f23488e3-4363-47e1-97cf-4a7972212cc1',
    'Human-in-the-loop Post-editing Workflows for Neural Machine Translation',
    'Maria Keller; James O. Smith',
    2024,
    'Machine Translation',
    '国外',
    '翻译科技',
    '用户实验；编辑日志分析',
    '译后编辑界面若能呈现术语风险和句法风险提示，可显著减少二次修改次数。',
    '论文关注译者在机器翻译后编辑中的行为路径，对平台后续设计 AI 初译、人工译文和审校链路有参考价值。',
    null,
    'https://example.com/frontier/translation-tech-2024-01',
    array['post-editing', 'NMT', 'workflow']
  ),
  (
    '2ff03ec3-39be-464f-b2d4-783c78a396e6',
    '平行语料库驱动的政务翻译术语规范化研究',
    '陈越，何嘉',
    2025,
    '外语电化教学',
    '国内',
    '语料库',
    '平行语料库检索；术语频次统计',
    '高频术语的译名稳定性与篇章主题相关，单纯词表管理不足以解决跨文本一致性问题。',
    '研究提示术语库需要与领域、篇章和项目上下文绑定，而不是仅保存孤立词条。',
    null,
    'https://example.com/frontier/corpus-2025-01',
    array['平行语料库', '政务翻译', '术语管理']
  ),
  (
    '8be2897d-f8f7-4488-b64e-9d01d809808f',
    'Large Language Models as Translation Critics: Reliability and Failure Modes',
    'Aisha Rahman; Daniel Lee',
    2025,
    'Computational Linguistics',
    '国外',
    '人工智能',
    '基准评测；人工复核',
    'LLM 对流畅度问题敏感，但对隐性意义偏移和文化负载词误判仍不稳定。',
    '适合作为 AI 审校按钮后续能力边界的参考：可做问题提示，但仍需人工判断意义和文化层面的风险。',
    null,
    'https://example.com/frontier/ai-2025-01',
    array['LLM', 'translation evaluation', 'quality estimation']
  ),
  (
    'd490b41e-7d8b-4276-b6ea-217c4f71573b',
    'Cognitive Load in Bilingual Text Revision Under Time Pressure',
    'Laura Chen; Miguel Santos',
    2024,
    'Journal of Cognitive Psychology',
    '国外',
    '心理学',
    '眼动实验；反应时测量',
    '时间压力会提高局部词汇错误修正率，但降低篇章层面连贯性检查的充分性。',
    '该结论可解释翻译练习中“局部准确但整体不顺”的问题，也适合支撑练习复盘设计。',
    null,
    'https://example.com/frontier/psychology-2024-01',
    array['cognitive load', 'revision', 'bilingual processing']
  )
on conflict (id) do nothing;
