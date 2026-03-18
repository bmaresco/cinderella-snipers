import { NextResponse } from 'next/server'

// Prevent Vercel/Next from caching this endpoint.
export const dynamic = 'force-dynamic'
export const revalidate = 0

type GeckoMultiPool = {
  attributes?: {
    address?: string
    market_cap_usd?: number | null
    fdv_usd?: number | null
  }
}

function isValidAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const searchParams = url.searchParams

  const poolsRaw = searchParams.get('pools') ?? ''
  const network = (searchParams.get('network') ?? process.env.GECKOTERMINAL_NETWORK ?? 'base').toLowerCase()

  const pools = poolsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(isValidAddress)

  if (!pools.length) {
    return NextResponse.json({ pools: {} }, { status: 200 })
  }

  // GeckoTerminal's public API has low rate limits; batch in chunks to avoid huge URLs.
  const CHUNK_SIZE = 80
  const chunks: string[][] = []
  for (let i = 0; i < pools.length; i += CHUNK_SIZE) {
    chunks.push(pools.slice(i, i + CHUNK_SIZE))
  }

  const out: Record<string, number | null> = {}

  for (const chunk of chunks) {
    const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(
      network
    )}/pools/multi/${chunk.join(',')}`

    const res = await fetch(geckoUrl, {
      headers: {
        Accept: 'application/json;version=20230203',
      },
      cache: 'no-store',
    })

    if (!res.ok) continue

    const json = (await res.json()) as { data?: GeckoMultiPool[] }
    for (const pool of json.data ?? []) {
      const addr = pool.attributes?.address
      if (!addr) continue
      const addrNorm = addr.toLowerCase()

      const marketCapUsd = pool.attributes?.market_cap_usd ?? null
      const fdvUsd = pool.attributes?.fdv_usd ?? null
      out[addrNorm] = marketCapUsd ?? fdvUsd
    }
  }

  return NextResponse.json({ pools: out }, { status: 200 })
}

