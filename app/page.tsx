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

async function getPlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) {
    console.error(error)
    return []
  }

  return data ?? []
}

export default async function HomePage() {
  const players = await getPlayers()

  return (
    <main className="min-h-screen bg-[#f3f3f3] font-sans">
      {/* Top black bar */}
      <div className="h-[10px] w-full bg-black" />

      {/* Hero Banner */}
      <section className="w-full">
        <img
          src="/banner.png"
          alt="Cinderella Snipers"
          className="w-full min-w-full object-cover"
        />
      </section>

      {/* Logo + tagline */}
      <section className="mx-auto flex max-w-4xl items-start justify-between px-6 pt-10 pb-8">
        <div className="space-y-6">
          <div className="text-center sm:text-left">
            <img
              src="/wordmark.png"
              alt="Cinderella Snipers"
              className="mx-auto w-full max-w-[460px] sm:mx-0"
            />
          </div>
          <p className="font-chivo-mono max-w-xl text-[11px] sm:text-xs font-semibold leading-6 tracking-[0.16em] text-black/70">
            EVERY YEAR, SOME RANDOM GUY DEFIES ALL ODDS AND BECOMES
            THE HERO OF THE TOURNAMENT. WHO WILL IT BE THIS YEAR? IF
            YOU FIND OUT – YOU GET RICH.
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-xs font-bold tracking-[0.2em] text-black/60">
            ON BASE
          </span>
          <div className="h-6 w-6 rounded-full bg-[#0052ff]" />
        </div>
      </section>

      {/* Player Rows */}
      <section className="mx-auto max-w-2xl px-4 pb-16">
        <PlayerList players={players} />
      </section>
    </main>
  )
}