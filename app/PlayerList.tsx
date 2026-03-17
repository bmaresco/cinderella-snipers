'use client'

import { useMemo, useState } from 'react'

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
}

type SortOption = 'name' | 'team' | 'market_cap' | 'next_game'

function formatNextMatchup(matchup: string | null, date: string | null) {
  if (!matchup || matchup === 'TBD') return 'TBD'
  if (!date) return matchup

  const formatted = new Date(date).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${matchup} ${formatted}`
}

function sortPlayers(players: Player[], sortBy: SortOption, ascending: boolean): Player[] {
  const sorted = [...players]
  const dir = ascending ? 1 : -1

  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => dir * a.full_name.localeCompare(b.full_name))
    case 'team':
      return sorted.sort((a, b) => dir * a.team_name.localeCompare(b.team_name))
    case 'market_cap':
      return sorted.sort((a, b) => dir * (a.market_cap_text ?? '').localeCompare(b.market_cap_text ?? ''))
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

  const sortedPlayers = useMemo(
    () => sortPlayers(filteredPlayers, sortBy, ascending),
    [filteredPlayers, sortBy, ascending]
  )

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
          className="rounded-[999px] bg-white px-4 py-3 shadow-sm sm:px-5"
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

            <div className="text-[13px] font-semibold text-[#7a7a7a]">
              {formatNextMatchup(player.next_matchup, player.next_matchup_at)}
            </div>

            <div className="text-[13px] font-semibold text-[#7a7a7a]">
              {player.market_cap_text ?? '—'}
            </div>

            <button className="mt-2 w-full rounded-full bg-black px-5 py-2 text-[13px] font-black text-white transition hover:scale-105 hover:bg-black/90 active:scale-95">
              BUY
            </button>
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

            <div className="flex-1 text-[13px] font-semibold text-[#7a7a7a]">
              {formatNextMatchup(player.next_matchup, player.next_matchup_at)}
            </div>

            <div className="flex-1 text-[13px] font-semibold text-[#7a7a7a]">
              {player.market_cap_text ?? '—'}
            </div>

            <button className="flex-shrink-0 rounded-full bg-black px-6 py-2.5 text-[13px] font-black text-white transition hover:scale-105 hover:bg-black/90 active:scale-95">
              BUY
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
