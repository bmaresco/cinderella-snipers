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
      marketCap?: number
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
const CACHE_TTL_MS = 5 * 60 * 1000

export async function getTokensByCreatorAddress(address: string): Promise<PublicClankerToken[]> {
  const key = address.toLowerCase()
  const cached = cacheByCreator.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tokens

  const url = new URL('https://clanker.world/api/search-creator')
  url.searchParams.set('q', address)
  url.searchParams.set('limit', '50')
  url.searchParams.set('offset', '0')

  const res = await fetch(url.toString(), {
    cache: 'no-store',
  })

  if (!res.ok) {
    console.warn('[clanker] search-creator failed:', res.status, res.statusText)
    return []
  }

  const json = (await res.json()) as SearchCreatorResponse
  const tokens = json.tokens ?? []

  cacheByCreator.set(key, { at: Date.now(), tokens })
  return tokens
}

