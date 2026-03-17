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
    <main className="min-h-screen bg-white font-sans">

      {/* Hero Banner */}
      <section className="w-full">
        <img
          src="/bannerlogo.png"
          alt="Cinderella Snipers"
          className="w-full min-w-full object-cover"
        />
      </section>

      {/* Description Pill */}
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-2">
        <div className="w-full rounded-2xl bg-[#3a6fa8] px-7 py-5 text-[15px] font-bold leading-relaxed text-white shadow-md">
          Cinderella Snipers is a live market where every eligible NCAA tournament shooter is a tradable asset and
          price is determined entirely by market demand. There are no formulas, stats-based scoring systems, or preset valuation models—only belief, liquidity, and positioning. Participants buy, sell, and rotate capital between player coins as the tournament unfolds, with price discovery driven by attention, performance, and narrative momentum in real time. It's a pure experiment in open price discovery during March Madness.
        </div>
      </div>

      {/* Divider */}
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-6">
        <div className="h-px flex-1 bg-black/20" />
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white shadow-sm">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-black/40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
        </div>
        <div className="h-px flex-1 bg-black/20" />
      </div>

      {/* Player Rows */}
      <div className="mx-auto max-w-2xl px-4 pb-16">
        <PlayerList players={players} />
      </div>
    </main>
  )
}