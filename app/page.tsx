import { supabase } from '@/lib/supabase'
import PlayerList from './PlayerList'

// Always fetch fresh data from Supabase (no build-time caching)
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Player = {
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

async function fetchNextGameForTeam(teamId: string) {
  const BASE =
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

  const extractNextGame = (events: any[] | undefined, id: string) => {
    const now = new Date()
    const next = (events ?? [])
      .filter(
        (e) =>
          !e.competitions?.[0]?.status?.type?.completed &&
          new Date(e.date) >= now
      )
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      )[0]

    if (!next) return null

    const comp = next.competitions?.[0]
    const opp = comp?.competitors?.find((c: any) => c.id !== String(id))
    const oppName: string | undefined = opp?.team?.displayName
    if (!oppName) return null

    const date = new Date(next.date)
    return {
      text: `vs. ${oppName}`,
      date: date.toISOString(),
    }
  }

  try {
    // 1) Try postseason schedule first
    const postRes = await fetch(`${BASE}/${teamId}/schedule?seasontype=3`, {
      cache: 'no-store',
    })
    if (postRes.ok) {
      const postJson = await postRes.json()
      const game = extractNextGame(postJson.events, teamId)
      if (game) return game
    }

    // 2) Fall back to regular season for non-tournament teams
    const regRes = await fetch(`${BASE}/${teamId}/schedule?seasontype=2`, {
      cache: 'no-store',
    })
    if (regRes.ok) {
      const regJson = await regRes.json()
      const game = extractNextGame(regJson.events, teamId)
      if (game) return game
    }

    return null
  } catch {
    return null
  }
}

async function getPlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) {
    console.error(error)
    return []
  }

  const players: Player[] = (data ?? []) as Player[]

  // Derive ESPN team IDs from team_logo_url, e.g. .../500/2608.png
  const teamIds = Array.from(
    new Set(
      players
        .map((p) => p.team_logo_url)
        .filter((u): u is string => !!u)
        .map((u) => {
          const match = u.match(/\/(\d+)\.png$/)
          return match?.[1]
        })
        .filter((id): id is string => !!id)
    )
  )

  const teamGamesEntries = await Promise.all(
    teamIds.map(async (id) => [id, await fetchNextGameForTeam(id)] as const)
  )
  const teamGames = new Map<string, { text: string; date: string } | null>(teamGamesEntries)

  return players.map((p) => {
    const logo = p.team_logo_url
    if (!logo) return p
    const match = logo.match(/\/(\d+)\.png$/)
    const teamId = match?.[1]
    if (!teamId) return p
    const game = teamGames.get(teamId)
    if (!game) return p
    return {
      ...p,
      next_matchup: game.text,
      next_matchup_at: game.date,
    }
  })
}

export default async function HomePage() {
  const players = await getPlayers()

  return (
    <main className="min-h-screen bg-[#f3f3f3] font-sans">
      {/* Hero Banner (cropped) */}
      <section className="relative w-full overflow-hidden h-[260px] sm:h-[320px]">
        <img
          src="/banner.png"
          alt="Cinderella Snipers"
          className="h-full w-full object-cover"
        />
        {/* Left logo */}
        <img
          src="/left-logo.png"
          alt="Left logo"
          className="absolute bottom-4 left-5 h-12 w-auto"
        />
        {/* Right logo */}
        <img
          src="/right-logo.png"
          alt="Right logo"
          className="absolute bottom-4 right-5 h-12 w-auto"
        />
      </section>

      {/* Logo + tagline */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-10 pb-8 text-center">
        <div className="space-y-6">
          <div>
            <img
              src="/wordmark.png"
              alt="Cinderella Snipers"
              className="mx-auto w-full max-w-[460px]"
            />
          </div>
          <p className="font-chivo-mono mx-auto max-w-xl text-[11px] sm:text-xs font-semibold leading-6 tracking-[0.16em] text-black/70">
            EVERY YEAR, SOMEONE DEFIES THE ODDS AND BECOMES THE HERO OF THE TOURNAMENT. THIS YEAR: YOU PICK THE RIGHT PLAYER, YOU GET RICH
            <br />
            PLAYER EVERY ROUND
            <br />
            EVERY COIN HAS A 10% SELL TAX: WHICH BUYS THE{' '}
            <span className="relative group underline underline-offset-2 cursor-help hover:cursor-crosshair">
              HIGHEST PERFORMING
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-56 -translate-x-1/2 rounded-md bg-black px-3 py-2 text-[10px] font-normal leading-relaxed text-white group-hover:block">
                TOKENOMICS DESCRIPTION WILL BE HERE
              </span>
            </span>
          </p>
        </div>
      </section>

      {/* Player Rows */}
      <section className="mx-auto max-w-2xl px-4 pb-16">
        <PlayerList players={players} />
      </section>
    </main>
  )
}