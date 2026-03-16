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

  const sortedPlayers = useMemo(
    () => sortPlayers(players, sortBy, ascending),
    [players, sortBy, ascending]
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
    <div className="space-y-3">
      {/* Column Headers (desktop only) */}
      <div className="mb-2 ml-[72px] hidden items-center px-4 sm:flex">
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
          className="rounded-2xl bg-[#e0e0e0] px-4 py-3 shadow-sm"
        >
          {/* Mobile layout */}
          <div className="flex flex-col gap-1 sm:hidden">
            <div className="flex items-center gap-3">
              <div className="h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-full bg-[#1a1a1a]">
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
              <div className="flex-1">
                <div className="text-[13px] font-black leading-tight text-black">
                  {player.full_name}
                </div>
              </div>
            </div>

            <div className="text-[13px] font-black text-black">
              {player.team_name}
            </div>

            <div className="text-[13px] font-black text-black">
              {formatNextMatchup(player.next_matchup, player.next_matchup_at)}
            </div>

            <div className="text-[13px] font-black text-black">
              {player.market_cap_text ?? '—'}
            </div>

            <button className="mt-1 w-full rounded-full bg-[#22d412] px-5 py-2 text-[13px] font-black text-black transition hover:scale-105 hover:bg-[#1abf0f] active:scale-95">
              BUY
            </button>
          </div>

          {/* Desktop layout (unchanged) */}
          <div className="hidden items-center gap-3 sm:flex">
            <div className="h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-full bg-[#1a1a1a]">
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

            <div className="w-[120px] flex-shrink-0">
              <div className="text-[13px] font-black leading-tight text-black">
                {player.full_name}
              </div>
            </div>

            <div className="flex-1 text-[13px] font-black text-black">
              {player.team_name}
            </div>

            <div className="flex-1 text-[13px] font-black text-black">
              {formatNextMatchup(player.next_matchup, player.next_matchup_at)}
            </div>

            <div className="flex-1 text-[13px] font-black text-black">
              {player.market_cap_text ?? '—'}
            </div>

            <button className="flex-shrink-0 rounded-full bg-[#22d412] px-5 py-2 text-[13px] font-black text-black transition hover:scale-105 hover:bg-[#1abf0f] active:scale-95">
              BUY
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
