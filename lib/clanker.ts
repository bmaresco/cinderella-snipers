export type ClankerDeployedToken = {
  id: number
  contract_address: string
  name: string
  symbol: string
  pool_address: string
  chain_id: number
  starting_market_cap: number | null
}

type ClankerDeployedResponse = {
  data?: ClankerDeployedToken[]
  hasMore?: boolean
  total?: number
  cursor?: string
  next_cursor?: string
  nextCursor?: string
}

const cacheByAddress = new Map<string, { at: number; tokens: ClankerDeployedToken[] }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export async function getTokensDeployedByAddress(address: string): Promise<ClankerDeployedToken[]> {
  const apiKey = process.env.CLANKER_API_KEY
  if (!apiKey) {
    console.warn('[clanker] Missing CLANKER_API_KEY; skipping token deployment mapping.')
    return []
  }

  const key = address.toLowerCase()
  const cached = cacheByAddress.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tokens

  const tokens: ClankerDeployedToken[] = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    const url = new URL('https://www.clanker.world/api/tokens/fetch-deployed-by-address')
    url.searchParams.set('address', address)
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: {
        'x-api-key': apiKey,
      },
      // Server-side fetch; no need to revalidate constantly.
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[clanker] Failed to fetch deployed tokens: ${res.status} ${res.statusText} ${text}`)
    }

    const json = (await res.json()) as ClankerDeployedResponse
    if (json.data?.length) tokens.push(...json.data)

    hasMore = Boolean(json.hasMore)
    cursor = json.next_cursor ?? json.nextCursor ?? json.cursor ?? undefined

    // Safety valve: if the API doesn’t provide cursor updates, prevent infinite loops.
    if (hasMore && cursor == null && tokens.length > 500) break
    if (hasMore && cursor == null && tokens.length > 0) break
  }

  cacheByAddress.set(key, { at: Date.now(), tokens })
  return tokens
}

