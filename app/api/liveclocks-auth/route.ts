import { Liveblocks } from '@liveblocks/node'
import { NextRequest, NextResponse } from 'next/server'

const liveblocks = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY! })

const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function POST(req: NextRequest) {
  try {
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
