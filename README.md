# 译境

译境是一个私域翻译协作与 AI 翻译研究平台，面向小组翻译、审校、术语管理和多模型译文对比实验。平台支持项目成员协作、文档分句、译文审校、最终锁定、术语库、项目聊天、AI 初翻、多模型并行翻译、候选译文采用，以及 Word / Excel 导出。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth / Postgres / RLS / Realtime
- Anthropic SDK
- OpenAI SDK，用于 OpenAI、DeepSeek、Doubao 等兼容接口
- Resend，用于邀请邮件
- Liveblocks / Tiptap，已安装依赖，协同编辑接入仍需继续整理
- xlsx，用于术语导入和实验结果导出

## 本地启动

1. 安装依赖：

```bash
npm install
```

2. 准备环境变量：

```bash
cp .env.example .env.local
```

然后按 `.env.example` 的说明填写 Supabase、AI Provider、邮件和站点 URL 配置。

3. 启动开发服务器：

```bash
npm run dev
```

默认访问：

```bash
http://localhost:3000
```

4. 常用检查命令：

```bash
npm run lint
npm run build
```

## 环境变量

本项目需要以下几类环境变量：

- Supabase：浏览器端连接、服务端 service role 操作、登录状态校验。
- AI Provider：DeepSeek、Anthropic、OpenAI、Doubao。
- Liveblocks：协同编辑鉴权。
- Resend：邀请邮件发送。
- Site URL：生成邀请链接和部署环境回调地址；生产邀请链接要求配置 `NEXT_PUBLIC_SITE_URL`。
- Platform Admin：固定邮箱 `rukunchen@hotmail.com` 可进入管理控制台和管理员成员操作入口。

完整变量名见 `.env.example`。不要把 `.env.local` 或任何真实密钥提交到仓库。

## 平台账号

首页和邀请页只提供登录入口，不开放公开注册。平台管理员在 `/admin` 管理控制台创建可登录账号，项目邀请发送、成员角色调整和移除其他成员还要求操作者同时是平台管理员和该项目经理。

平台管理员固定为 `rukunchen@hotmail.com`。`/admin` 和管理员后端接口都按当前登录用户邮箱判断，不依赖 `profiles.role`。

## Supabase 初始化

当前主 migration 链可以按 `01-27` 初始化空数据库。现有代码实际依赖这些主要表：

- `profiles`
- `projects`
- `documents`
- `project_members`
- `segments`
- `glossary_terms`
- `invitations`
- `chat_messages`
- `parallel_translations`
- `writing_templates`
- `writing_projects`
- `writing_sections`
- `research_library_items`
- `translation_practice_items`
- `translation_practice_segments`
- `translation_practice_issues`
- `expression_cards`
- `platform_admins`
- `admin_audit_logs`
- `reading_articles`
- `reading_notes`
- `frontier_literature_items`

建议运行顺序：

1. `supabase/01_create_base_project_document_glossary_tables.sql`
2. `supabase/02_create_profiles.sql`
3. `supabase/03_create_project_members.sql`
4. `supabase/04_migrate_segments_to_table.sql`
5. `supabase/05_invitations_and_chat.sql`
6. `supabase/06_rls_policies.sql`
7. `supabase/07_parallel_translations.sql`
8. `supabase/08_segment_notes.sql`
9. `supabase/09_glossary_extend.sql`
10. `supabase/10_documents_updated_at.sql`
11. `supabase/11_project_creator_member.sql`
12. `supabase/12_tighten_invitation_profiles_security.sql`
13. `supabase/13_writing_workshop.sql`
14. `supabase/14_writing_custom_templates.sql`
15. `supabase/15_document_review_overall_note.sql`
16. `supabase/16_segment_translator_target_snapshot.sql`
17. `supabase/17_segment_review_target.sql`
18. `supabase/18_chat_attachments_document_scope.sql`
19. `supabase/19_merge_document_chat_to_task_chat.sql`
20. `supabase/20_research_library.sql`
21. `supabase/21_ppt_slide_translation_metadata.sql`
22. `supabase/22_translation_practice_lab.sql`
23. `supabase/23_platform_admins.sql`
24. `supabase/24_admin_audit_logs.sql`
25. `supabase/25_reading_room.sql`
26. `supabase/26_reading_article_genre.sql`
27. `supabase/27_frontier_literature.sql`

`supabase/archive/add_segments_column.sql` 是旧版 `documents.segments` JSONB 分句结构的历史兼容脚本，不属于新环境初始化链路，不应在新数据库初始化时执行。`01` 会临时创建 `documents.segments` 以兼容 `04_migrate_segments_to_table.sql`，`04` 会在迁移完成后删除该旧字段。`18` 和 `20` 还会创建聊天附件、研究 PDF 所需的 Supabase Storage bucket。

## AI API Key 配置

至少配置一个可用的 AI Provider 才能使用翻译能力。

- DeepSeek：配置 `DEEPSEEK_API_KEY`。
- Anthropic Claude：配置 `ANTHROPIC_API_KEY`。
- OpenAI：配置 `OPENAI_API_KEY`，如使用代理或兼容服务可配置 `OPENAI_BASE_URL`。
- Doubao：配置 `DOUBAO_API_KEY`，必要时配置 `DOUBAO_BASE_URL`。也兼容火山方舟官方文档里的 `ARK_API_KEY` / `ARK_BASE_URL` 命名。

多模型并行翻译工作台会根据前端模型配置调用对应 provider。未配置的 provider 会在 API 返回配置缺失错误。

## Vercel 部署

1. 在 Vercel 导入项目仓库。
2. 在 Project Settings → Environment Variables 中添加 `.env.example` 中列出的变量。
3. 确认 Supabase 数据库已完成初始化和 RLS 配置。
4. 确认 Supabase Auth 的 Site URL / Redirect URLs 包含生产域名。
5. 如果使用邀请邮件，确认 `NEXT_PUBLIC_SITE_URL` 是生产站点 URL，且与最终访问域名一致。
6. 部署命令使用默认 Next.js 配置即可：

```bash
npm run build
```

部署后建议先验证：

- 登录
- 管理员进入 `/admin` 并创建成员账号
- 创建项目
- 创建文档并分句
- 调用 AI 翻译
- 由平台管理员兼项目经理邀请成员
- 术语库新增/导入
- 译训库创建练习并调用 AI 分析 / 高频表达提取
- 导出 Word / Excel

## 常见问题

### `npm run lint` 应该通过吗？

应该通过。提交前建议运行：

```bash
npm run lint
```

### `npm run build` 在沙箱或受限环境失败怎么办？

Next.js 16 使用 Turbopack 构建时可能需要创建进程或绑定本地端口。在受限沙箱中可能出现 `Operation not permitted`。在正常本地终端或 Vercel 环境中重新运行确认。

### 新 Supabase 环境执行 migration 失败怎么办？

确认只按 `01-22` 主链执行，不要执行 `supabase/archive/add_segments_column.sql`。如果使用 Supabase Dashboard 手动执行 SQL，请严格按 README 中的顺序执行。

### 邀请链接域名不对怎么办？

检查 `NEXT_PUBLIC_SITE_URL`。本地开发可设为 `http://localhost:3000`，生产环境必须设为最终访问域名。

### AI 翻译报 provider 未配置怎么办？

检查对应 API key 是否已配置到运行环境，并重启开发服务器或重新部署。

### 邮件发送失败怎么办？

检查 `RESEND_API_KEY` 是否配置。默认发件人仍使用 Resend 测试域名时，收件范围可能受 Resend 账号状态限制；生产环境建议配置并验证自有发信域名。

### Liveblocks 协同编辑现在完整可用吗？

依赖和鉴权 route 已存在，但协同编辑组件结构还需要继续整理。当前核心翻译协作主要依赖 Supabase 表和页面状态流。
