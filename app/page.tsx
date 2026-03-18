import { supabase } from '@/lib/supabase'
import { getTokensByCreatorAddress } from '@/lib/clanker'
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
  clanker_contract_address: string | null
  clanker_market_cap_usd: number | null
}

const PLAYER_TOKEN_DEPLOYER_WALLET = '0xe2a26dD1AB4942C5a500093161f33368e27953a1'

function normalizeForTokenMatch(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function fetchNextGameForTeam(teamId: string) {
  const BASE =
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

  const extractNextGameOrEliminated = (events: any[] | undefined, id: string) => {
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
      // If there's no upcoming postseason game, we may be able to infer elimination.
      const game = (() => {
        const res = extractNextGameOrEliminated(postJson.events, teamId)
        if (res) return res

        // No upcoming game found; check if the most recent completed postseason game was a loss.
        const completed = (postJson.events ?? [])
          .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

        if (!completed) return null

        const comp = completed.competitions?.[0]
        const competitors = comp?.competitors ?? []
        const teamComp = competitors.find((c: any) => c.id === String(teamId))
        const oppComp = competitors.find((c: any) => c.id !== String(teamId))

        // Use NaN so TypeScript can safely narrow to `number` after the checks below.
        const teamScore = teamComp?.score != null ? Number(teamComp.score) : NaN
        const oppScore = oppComp?.score != null ? Number(oppComp.score) : NaN

        if (!Number.isFinite(teamScore) || !Number.isFinite(oppScore)) return null
        if (teamScore >= oppScore) return null

        return { text: 'ELIMINATED', date: null as string | null }
      })()
      if (game) return game
    }

    // 2) Fall back to regular season for non-tournament teams
    const regRes = await fetch(`${BASE}/${teamId}/schedule?seasontype=2`, {
      cache: 'no-store',
    })
    if (regRes.ok) {
      const regJson = await regRes.json()
      const game = extractNextGameOrEliminated(regJson.events, teamId)
      if (game) return game
    }

    return null
  } catch {
    return null
  }
}

async function getPlayers(): Promise<Player[]> {
  if (!supabase) {
    console.warn('Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL/KEY). Returning empty players.')
    return []
  }

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) {
    console.error(error)
    return []
  }

  const players: Omit<Player, 'clanker_contract_address' | 'clanker_market_cap_usd'>[] = (data ?? []) as any

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
  const teamGames = new Map<string, { text: string; date: string | null } | null>(teamGamesEntries)

  const deployedTokens = await getTokensByCreatorAddress(PLAYER_TOKEN_DEPLOYER_WALLET)
  const deployedForMatch = deployedTokens.map((token) => ({
    token,
    nameNorm: normalizeForTokenMatch(token.name ?? ''),
  }))

  return players.map((p) => {
    const token = (() => {
      let bestScore = 0
      let best: (typeof deployedForMatch)[number] | null = null

      const nameParts = p.full_name.trim().split(/\s+/).filter(Boolean)
      const first = nameParts[0] ?? ''
      const last = nameParts[nameParts.length - 1] ?? ''
      const firstLastNorm = normalizeForTokenMatch(`${first}${last}`)
      const teamNorm = normalizeForTokenMatch(p.team_name)

      for (const dt of deployedForMatch) {
        const tokenNorm = dt.nameNorm
        let score = 0
        if (tokenNorm.includes(firstLastNorm) && tokenNorm.includes(teamNorm)) score = 10
        else if (tokenNorm.includes(firstLastNorm) || tokenNorm.includes(teamNorm)) score = 5

        if (score > bestScore) {
          bestScore = score
          best = dt
        }
      }

      return best?.token ?? null
    })()

    const logo = p.team_logo_url
    const match = logo ? logo.match(/\/(\d+)\.png$/) : null
    const teamId = match?.[1]
    const game = teamId ? teamGames.get(teamId) : null

    return {
      ...p,
      next_matchup: game?.text ?? p.next_matchup,
      // If `game` exists but `date` is null (ELIMINATED), we must clear the stored date.
      next_matchup_at: game ? game.date : p.next_matchup_at,
      clanker_contract_address: token?.contract_address ?? null,
      clanker_market_cap_usd: token?.related?.market?.marketCap ?? null,
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
          <p className="font-chivo-mono mx-auto max-w-xl text-[11px] sm:text-xs font-semibold leading-6 tracking-[0.16em] text-[#838383]">
            EVERY YEAR, SOMEONE DEFIES THE ODDS AND BECOMES THE HERO OF THE TOURNAMENT. THIS YEAR: YOU PICK THE RIGHT
            PLAYER, YOU GET RICH.
            <br />
            <br />
            EVERY COIN HAS A 10% SELL TAX: WHICH BUYS THE{' '}
            <span className="relative group underline underline-offset-2 cursor-help">
              HIGHEST PERFORMING
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-md bg-black px-3 py-2 text-[10px] font-normal leading-relaxed text-white text-left group-hover:block">
                EVERY ROUND, THE PLAYER WITH THE MOST FANTASY POINTS WILL BE THE WINNER.
                <br />
                <br />
                PLAYERS ON UNDERDOG TEAMS RECEIVE A MULTIPLIER TO THEIR FANTASY POINTS BASED ON THE SEED DIFFERENCE:
                <br />
                10–15: 1.6X MULTIPLIER
                <br />
                5–9: 1.4X MULTIPLIER
                <br />
                1–4: 1.2X MULTIPLIER
              </span>
            </span>{' '}
            PLAYER
            <br />
            EVERY ROUND
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