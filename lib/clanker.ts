export type PublicClankerToken = {
  contract_address: string
  name: string
  symbol: string
  img_url?: string
  chain_id: number
  deployed_at?: string
  created_at?: string
  msg_sender?: string
  related?: {
    market?: {
      marketCap?: number | null
      price?: number
    }
  }
}

type SearchCreatorResponse = {
  tokens?: PublicClankerToken[]
  total?: number
  hasMore?: boolean
}

const cacheByCreator = new Map<string, { at: number; tokens: PublicClankerToken[] }>()

export async function getTokensByCreatorAddress(
  address: string,
  opts?: {
    cacheTtlMs?: number
    limit?: number
  }
): Promise<PublicClankerToken[]> {
  const cacheTtlMs = opts?.cacheTtlMs ?? 5 * 60 * 1000
  const limit = opts?.limit ?? 50

  const key = address.toLowerCase()
  const cached = cacheByCreator.get(key)
  if (cacheTtlMs > 0 && cached && Date.now() - cached.at < cacheTtlMs) return cached.tokens

  const tokens: PublicClankerToken[] = []
  let offset = 0
  let hasMore = true
  let page = 0

  while (hasMore) {
    page += 1
    if (page > 20) break // safety valve

    const url = new URL('https://clanker.world/api/search-creator')
    url.searchParams.set('q', address)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))

    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) {
      console.warn('[clanker] search-creator failed:', res.status, res.statusText)
      break
    }

    const json = (await res.json()) as SearchCreatorResponse
    tokens.push(...(json.tokens ?? []))

    hasMore = Boolean(json.hasMore) && (json.tokens?.length ?? 0) > 0
    offset += limit
    if (!hasMore) break
  }

  if (cacheTtlMs > 0) cacheByCreator.set(key, { at: Date.now(), tokens })
  return tokens
}

