import { Liveblocks } from '@liveblocks/node'
import { NextRequest, NextResponse } from 'next/server'

let liveblocksInstance: Liveblocks | null = null

function getLiveblocks(): Liveblocks | null {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY?.trim()
  if (!secret || secret === '""' || secret === "''") return null
  if (!liveblocksInstance) {
    liveblocksInstance = new Liveblocks({ secret })
  }
  return liveblocksInstance
}

const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function POST(req: NextRequest) {
  try {
    const liveblocks = getLiveblocks()
    if (!liveblocks) {
      return NextResponse.json({ error: 'Liveblocks 未配置（缺少 LIVEBLOCKS_SECRET_KEY）' }, { status: 500 })
    }

    const { room, userId, userName } = await req.json()
    const color = colors[Math.floor(Math.random() * colors.length)]

    const session = liveblocks.prepareSession(userId || 'anonymous', {
      userInfo: { name: userName || '译员', color }
    })
    session.allow(room, session.FULL_ACCESS)

    const { status, body } = await session.authorize()
    return new NextResponse(body, { status })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
