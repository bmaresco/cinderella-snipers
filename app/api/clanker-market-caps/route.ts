import { NextResponse } from 'next/server'
import { getTokensByCreatorAddress } from '@/lib/clanker'

const PLAYER_TOKEN_DEPLOYER_WALLET = '0xe2a26dD1AB4942C5a500093161f33368e27953a1'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  // Use `cacheTtlMs=0` so the UI gets fresh-ish updates.
  const tokens = await getTokensByCreatorAddress(PLAYER_TOKEN_DEPLOYER_WALLET, { cacheTtlMs: 0 })

  const caps: Record<string, number | null> = {}
  for (const token of tokens) {
    if (!token.contract_address) continue
    const addr = token.contract_address.toLowerCase()
    caps[addr] = token.related?.market?.marketCap ?? null
  }

  return NextResponse.json({ caps }, { status: 200 })
}

