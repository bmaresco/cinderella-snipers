'use client'

import { useEffect, useMemo, useState } from 'react'

export type Player = {
  id: number
  slug: string
  full_name: string
  school_name: string
  team_name: string
  position: string | null
  espn_player_id: string | null
  profile_image_url: string | null
  team_logo_url: string | null
  next_matchup: string | null
  next_matchup_at: string | null
  market_cap_text: string | null
  clanker_contract_address: string | null
  clanker_market_cap_usd: number | null
}

type SortOption = 'name' | 'team' | 'market_cap' | 'next_game'

function formatNextMatchup(matchup: string | null, date: string | null) {
  if (!matchup || matchup === 'TBD') return 'TBD'
  if (matchup === 'ELIMINATED') return 'ELIMINATED'
  if (!date) return matchup

  const dt = new Date(date)
  const now = new Date()

  const isToday =
    dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate()

  if (isToday) {
    const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${matchup} Today, ${time}`
  }

  const formatted = dt.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${matchup} ${formatted}`
}

function parseMarketCapNumber(text: string | null | undefined): number | null {
  if (!text) return null
  const raw = text.trim()
  if (!raw || raw === '—') return null

  // Normalize common compact formats like "$1.2M" or "12,345,678"
  const cleaned = raw.replace(/[$,\s]/g, '')
  const m = cleaned.match(/^(-?\d+(\.\d+)?)([KMB])?$/i)
  if (!m) return null

  const base = Number(m[1])
  if (!Number.isFinite(base)) return null

  const suffix = (m[3] ?? '').toUpperCase()
  const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1
  return base * mult
}

function formatUsdCompact(marketCapUsd: number): string {
  if (!Number.isFinite(marketCapUsd)) return '—'
  const abs = Math.abs(marketCapUsd)
  const sign = marketCapUsd < 0 ? '-' : ''

  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`
  return `${sign}$${abs.toFixed(2)}`
}

function sortPlayers(
  players: Player[],
  sortBy: SortOption,
  ascending: boolean,
  getMarketCapValue: (p: Player) => number | null
): Player[] {
  const sorted = [...players]
  const dir = ascending ? 1 : -1

  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => dir * a.full_name.localeCompare(b.full_name))
    case 'team':
      return sorted.sort((a, b) => dir * a.team_name.localeCompare(b.team_name))
    case 'market_cap':
      return sorted.sort((a, b) => {
        const aCap = getMarketCapValue(a) ?? 0
        const bCap = getMarketCapValue(b) ?? 0
        return dir * (aCap - bCap)
      })
    case 'next_game': {
      return sorted.sort((a, b) => {
        const aDate = a.next_matchup_at ? new Date(a.next_matchup_at).getTime() : Infinity
        const bDate = b.next_matchup_at ? new Date(b.next_matchup_at).getTime() : Infinity
        return dir * (aDate - bDate)
      })
    }
    default:
      return sorted
  }
}

export default function PlayerList({ players }: { players: Player[] }) {
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [ascending, setAscending] = useState(true)
  const [search, setSearch] = useState('')
  const [liveMarketCapsByContract, setLiveMarketCapsByContract] = useState<Record<string, number | null>>({})

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'team', label: 'Team' },
    { value: 'next_game', label: 'Next game' },
    { value: 'market_cap', label: 'Market cap' },
  ]

  const filteredPlayers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return players
    return players.filter((p) => {
      const name = p.full_name.toLowerCase()
      const team = p.team_name.toLowerCase()
      return name.includes(term) || team.includes(term)
    })
  }, [players, search])

  const getMarketCapValue = (p: Player) => {
    if (p.clanker_contract_address) {
      const live = liveMarketCapsByContract[p.clanker_contract_address.toLowerCase()]
      if (live != null) return live
    }
    return p.clanker_market_cap_usd ?? parseMarketCapNumber(p.market_cap_text)
  }

  const getMarketCapDisplay = (p: Player) => {
    if (p.clanker_contract_address) {
      const live = liveMarketCapsByContract[p.clanker_contract_address.toLowerCase()]
      if (live != null) return formatUsdCompact(live)
    }
    if (p.clanker_market_cap_usd != null) return formatUsdCompact(p.clanker_market_cap_usd)
    return p.market_cap_text ?? '—'
  }

  const sortedPlayers = useMemo(() => sortPlayers(filteredPlayers, sortBy, ascending, getMarketCapValue), [
    filteredPlayers,
    sortBy,
    ascending,
    liveMarketCapsByContract,
  ])

  const contractAddresses = useMemo(() => {
    return Array.from(
      new Set(
        players.map((p) => (p.clanker_contract_address ? p.clanker_contract_address.toLowerCase() : null)).filter(Boolean)
      )
    ) as string[]
  }, [players])

  useEffect(() => {
    if (!contractAddresses.length) return

    let cancelled = false
    const fetchLiveMarketCaps = async () => {
      try {
        const res = await fetch(`/api/clanker-market-caps`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { caps: Record<string, number | null> }
        if (cancelled) return
        setLiveMarketCapsByContract(json.caps ?? {})
      } catch {
        // Polling errors shouldn't break the UI.
      }
    }

    fetchLiveMarketCaps()
    const interval = setInterval(fetchLiveMarketCaps, 30_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [contractAddresses])

  const handleHeaderClick = (key: SortOption) => {
    if (sortBy === key) {
      setAscending((a) => !a)
    } else {
      setSortBy(key)
      setAscending(true)
    }
  }

  const arrow = ascending ? '↓' : '↑'

  return (
    <div className="font-archivo-narrow space-y-3">
      {/* Mobile search + sort */}
      <div className="flex flex-col gap-2 px-4 sm:hidden">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players or teams"
            className="flex-1 rounded-[999px] bg-[#e9e9e9] px-4 py-2 text-[13px] font-semibold text-black outline-none"
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-black/60">Sort players by</span>
            <div className="flex items-center gap-1">
              <select
                value={sortBy}
                onChange={(e) => handleHeaderClick(e.target.value as SortOption)}
                className="rounded-lg border border-black/20 bg-white px-2 py-1 text-[11px] font-semibold text-black"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAscending((a) => !a)}
                className="flex h-7 w-7 flex-col items-center justify-center rounded-full border border-black/20 bg-white text-black/60"
                aria-label={ascending ? 'Sort descending' : 'Sort ascending'}
              >
                <svg
                  className={`h-2.5 w-2.5 ${ascending ? 'text-[#3a6fa8]' : 'text-black/30'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                <svg
                  className={`h-2.5 w-2.5 ${!ascending ? 'text-[#3a6fa8]' : 'text-black/30'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop search */}
      <div className="hidden px-6 pb-1 sm:block">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players or teams"
          className="w-full rounded-[999px] bg-[#e9e9e9] px-4 py-2 text-sm font-semibold text-black outline-none"
        />
      </div>

      {/* Column Headers (desktop only) */}
      <div className="mb-2 hidden items-center px-6 sm:flex">
        {/* Spacer to align with avatar */}
        <div className="w-[72px] flex-shrink-0" />
        <button
          type="button"
          onClick={() => handleHeaderClick('name')}
          className={`w-[120px] flex-shrink-0 text-left text-sm font-bold focus:outline-none ${sortBy === 'name' ? 'text-[#3a6fa8]' : 'text-black/50'}`}
        >
          Name {sortBy === 'name' ? arrow : '↓'}
        </button>
        <button
          type="button"
          onClick={() => handleHeaderClick('team')}
          className={`flex-1 text-left text-sm font-bold focus:outline-none ${sortBy === 'team' ? 'text-[#3a6fa8]' : 'text-black/50'}`}
        >
          Team {sortBy === 'team' ? arrow : '↓'}
        </button>
        <button
          type="button"
          onClick={() => handleHeaderClick('next_game')}
          className={`flex-1 text-left text-sm font-bold focus:outline-none ${sortBy === 'next_game' ? 'text-[#3a6fa8]' : 'text-black/50'}`}
        >
          Next game {sortBy === 'next_game' ? arrow : '↓'}
        </button>
        <button
          type="button"
          onClick={() => handleHeaderClick('market_cap')}
          className={`flex-1 text-left text-sm font-bold focus:outline-none ${sortBy === 'market_cap' ? 'text-[#3a6fa8]' : 'text-black/50'}`}
        >
          Market cap {sortBy === 'market_cap' ? arrow : '↓'}
        </button>
        <div className="w-[80px] flex-shrink-0"></div>
      </div>

      {sortedPlayers.map((player) => (
        <div
          key={player.id}
          className="rounded-2xl bg-white px-4 py-3 shadow-sm sm:px-5"
        >
          {/* Mobile layout */}
          <div className="flex flex-col gap-1 sm:hidden">
            <div className="flex items-center gap-3">
              <div className="relative h-[52px] w-[52px] flex-shrink-0">
                <div className="h-full w-full overflow-hidden rounded-full bg-[#1a1a1a]">
                  <img
                    src={player.profile_image_url || "/silhouette.png"}
                    alt={player.full_name}
                    className="h-full w-full object-cover"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth === 60 && img.naturalHeight === 45) {
                        img.src = "/silhouette.png"
                      }
                    }}
                    onError={(e) => {
                      e.currentTarget.src = "/silhouette.png"
                    }}
                  />
                </div>
                {player.team_logo_url && (
                  <div className="absolute -top-1 -right-1 h-5 w-5 overflow-hidden rounded-full border border-black bg-white">
                    <img
                      src={player.team_logo_url}
                      alt={`${player.team_name} logo`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-bold leading-tight text-black">
                  {player.full_name}
                </div>
              </div>
            </div>

            <div className="text-[13px] font-semibold text-[#7a7a7a]">
              {player.team_name}
            </div>

            <div
              className={
                player.next_matchup === 'ELIMINATED'
                  ? 'text-[13px] font-semibold text-red-600'
                  : 'text-[13px] font-semibold text-[#7a7a7a]'
              }
            >
              {formatNextMatchup(player.next_matchup, player.next_matchup_at)}
            </div>

            <div className="text-[13px] font-semibold text-[#7a7a7a]">
              {getMarketCapDisplay(player)}
            </div>

            {player.clanker_contract_address ? (
              <a
                href={`https://clanker.world/clanker/${player.clanker_contract_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block w-full rounded-full bg-black px-5 py-2 text-[13px] font-black text-white transition hover:scale-105 hover:bg-black/90 active:scale-95 text-center"
                aria-label={`Buy ${player.full_name}`}
              >
                BUY
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="mt-2 w-full rounded-full bg-black px-5 py-2 text-[13px] font-black text-white opacity-60 transition"
              >
                BUY
              </button>
            )}
          </div>

          {/* Desktop layout (unchanged) */}
          <div className="hidden items-center gap-4 sm:flex">
            <div className="relative h-[52px] w-[52px] flex-shrink-0">
              <div className="h-full w-full overflow-hidden rounded-full bg-[#1a1a1a]">
                <img
                  src={player.profile_image_url || "/silhouette.png"}
                  alt={player.full_name}
                  className="h-full w-full object-cover"
                  onLoad={(e) => {
                    const img = e.currentTarget
                    if (img.naturalWidth === 60 && img.naturalHeight === 45) {
                      img.src = "/silhouette.png"
                    }
                  }}
                  onError={(e) => {
                    e.currentTarget.src = "/silhouette.png"
                  }}
                />
              </div>
              {player.team_logo_url && (
                <div className="absolute -top-1 -right-1 h-5 w-5 overflow-hidden rounded-full border border-black bg-white">
                  <img
                    src={player.team_logo_url}
                    alt={`${player.team_name} logo`}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="w-[120px] flex-shrink-0">
              <div className="text-[13px] font-bold leading-tight text-black">
                {player.full_name}
              </div>
            </div>

            <div className="flex-1 text-[13px] font-semibold text-[#7a7a7a]">
              {player.team_name}
            </div>

            <div
              className={
                player.next_matchup === 'ELIMINATED'
                  ? 'flex-1 text-[13px] font-semibold text-red-600'
                  : 'flex-1 text-[13px] font-semibold text-[#7a7a7a]'
              }
            >
              {formatNextMatchup(player.next_matchup, player.next_matchup_at)}
            </div>

            <div className="flex-1 text-[13px] font-semibold text-[#7a7a7a]">
              {getMarketCapDisplay(player)}
            </div>

            {player.clanker_contract_address ? (
              <a
                href={`https://clanker.world/clanker/${player.clanker_contract_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 block rounded-full bg-black px-6 py-2.5 text-[13px] font-black text-white transition hover:scale-105 hover:bg-black/90 active:scale-95 text-center"
                aria-label={`Buy ${player.full_name}`}
              >
                BUY
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="flex-shrink-0 rounded-full bg-black px-6 py-2.5 text-[13px] font-black text-white opacity-60 transition"
              >
                BUY
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
