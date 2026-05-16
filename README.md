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
- Site URL：生成邀请链接和部署环境回调地址。

完整变量名见 `.env.example`。不要把 `.env.local` 或任何真实密钥提交到仓库。

## Supabase 初始化

当前主 migration 链可以按 `01-11` 初始化空数据库。现有代码实际依赖这些基础表：

- `profiles`
- `projects`
- `documents`
- `project_members`
- `segments`
- `glossary_terms`
- `invitations`
- `chat_messages`
- `parallel_translations`

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

`supabase/archive/add_segments_column.sql` 是旧版 `documents.segments` JSONB 分句结构的历史兼容脚本，不属于新环境初始化链路，不应在新数据库初始化时执行。`01` 会临时创建 `documents.segments` 以兼容 `04_migrate_segments_to_table.sql`，`04` 会在迁移完成后删除该旧字段。

## AI API Key 配置

至少配置一个可用的 AI Provider 才能使用翻译能力。

- DeepSeek：配置 `DEEPSEEK_API_KEY`。
- Anthropic Claude：配置 `ANTHROPIC_API_KEY`。
- OpenAI：配置 `OPENAI_API_KEY`，如使用代理或兼容服务可配置 `OPENAI_BASE_URL`。
- Doubao：配置 `DOUBAO_API_KEY`，必要时配置 `DOUBAO_BASE_URL`。

多模型并行翻译工作台会根据前端模型配置调用对应 provider。未配置的 provider 会在 API 返回配置缺失错误。

## Vercel 部署

1. 在 Vercel 导入项目仓库。
2. 在 Project Settings → Environment Variables 中添加 `.env.example` 中列出的变量。
3. 确认 Supabase 数据库已完成初始化和 RLS 配置。
4. 确认 Supabase Auth 的 Site URL / Redirect URLs 包含生产域名。
5. 如果使用邀请邮件，确认 `NEXT_PUBLIC_SITE_URL` 是生产站点 URL。
6. 部署命令使用默认 Next.js 配置即可：

```bash
npm run build
```

部署后建议先验证：

- 登录/注册
- 创建项目
- 创建文档并分句
- 调用 AI 翻译
- 邀请成员
- 术语库新增/导入
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

确认只按 `01-11` 主链执行，不要执行 `supabase/archive/add_segments_column.sql`。如果使用 Supabase Dashboard 手动执行 SQL，请严格按 README 中的顺序执行。

### 邀请链接域名不对怎么办？

检查 `NEXT_PUBLIC_SITE_URL`。本地开发可设为 `http://localhost:3000`，生产环境应设为 Vercel 域名或自定义域名。

### AI 翻译报 provider 未配置怎么办？

检查对应 API key 是否已配置到运行环境，并重启开发服务器或重新部署。

### 邮件发送失败怎么办？

检查 `RESEND_API_KEY` 是否配置。默认发件人仍使用 Resend 测试域名时，收件范围可能受 Resend 账号状态限制；生产环境建议配置并验证自有发信域名。

### Liveblocks 协同编辑现在完整可用吗？

依赖和鉴权 route 已存在，但协同编辑组件结构还需要继续整理。当前核心翻译协作主要依赖 Supabase 表和页面状态流。
