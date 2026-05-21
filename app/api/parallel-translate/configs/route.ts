import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'
import type { WindowConfig } from '@/lib/modelPresets'

const CONFIG_PROVIDER = '__config__'
const CONFIG_SOURCE = '__PARALLEL_WORKBENCH_CONFIG__'
const CONFIG_MODEL_PREFIX = 'parallel_config_v1_slot_'

async function requireDocumentAccess(req: NextRequest, documentId: string) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const admin = supabaseAdmin()
  const { data: doc } = await admin
    .from('documents')
    .select('id, project_id')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) return { error: NextResponse.json({ error: '文档不存在' }, { status: 404 }) }

  const myRole = await getMyRole(client, doc.project_id, user.id)
  if (!myRole) return { error: NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 }) }
  return { admin, user, doc }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const documentId = url.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: '缺少 documentId' }, { status: 400 })

  const access = await requireDocumentAccess(req, documentId)
  if (access.error) return access.error

  const { data, error } = await access.admin!
    .from('parallel_translations')
    .select('model, prompt, updated_at')
    .eq('document_id', documentId)
    .eq('provider', CONFIG_PROVIDER)
    .order('model', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const configs = (data || [])
    .map(row => parseConfig(row.model, row.prompt))
    .filter((cfg): cfg is WindowConfig => Boolean(cfg))

  return NextResponse.json({ configs: configs.length === 4 ? configs : [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const documentId = typeof body.documentId === 'string' ? body.documentId : ''
  const configs = Array.isArray(body.configs) ? body.configs as WindowConfig[] : []
  if (!documentId) return NextResponse.json({ error: '缺少 documentId' }, { status: 400 })
  if (configs.length !== 4) return NextResponse.json({ error: '需要保存 4 个模型窗口配置' }, { status: 400 })

  const access = await requireDocumentAccess(req, documentId)
  if (access.error) return access.error

  const { data: firstSeg } = await access.admin!
    .from('segments')
    .select('id, source')
    .eq('document_id', documentId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!firstSeg) return NextResponse.json({ error: '请先分句，再保存 AI 实验设置' }, { status: 400 })

  const rows = configs.map((cfg, idx) => ({
    document_id: documentId,
    segment_id: firstSeg.id,
    provider: CONFIG_PROVIDER,
    model: `${CONFIG_MODEL_PREFIX}${idx}`,
    temperature: 0.3,
    prompt: JSON.stringify(cfg),
    source_text: CONFIG_SOURCE,
    translated_text: '',
    status: 'pending',
    error_message: null,
    created_by: access.user!.id,
  }))

  const { error } = await access.admin!
    .from('parallel_translations')
    .upsert(rows, { onConflict: 'segment_id,provider,model' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function parseConfig(model: string, prompt: string | null): WindowConfig | null {
  if (!model.startsWith(CONFIG_MODEL_PREFIX) || !prompt) return null
  try {
    const parsed = JSON.parse(prompt) as Partial<WindowConfig>
    if (!parsed.id || typeof parsed.enabled !== 'boolean' || !parsed.provider || !parsed.model) return null
    return {
      id: parsed.id,
      enabled: parsed.enabled,
      provider: parsed.provider,
      model: parsed.model,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : 0.3,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
    } as WindowConfig
  } catch {
    return null
  }
}
