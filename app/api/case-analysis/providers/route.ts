import { NextResponse } from 'next/server'
import { providerConfigured, type ProviderId } from '@/lib/aiProviders'
import { ALL_PROVIDER_IDS } from '@/lib/translateShared'

export async function GET() {
  const configured = Object.fromEntries(
    ALL_PROVIDER_IDS.map(id => [id, providerConfigured(id as ProviderId)])
  )
  return NextResponse.json({ configured })
}
