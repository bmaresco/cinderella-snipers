// sync-players.mjs
// Fixes TWO problems:
//   1. Incorrect/missing team logo URLs
//   2. next_matchup shows "TBD" because regular season schedule returns nothing during tournament
//
// Run: node sync-players.mjs
// Requires: @supabase/supabase-js
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// school_name (matches your DB) → ESPN team ID
const TEAM_IDS = {
  'Akron Zips': 2006,
  'Alabama Crimson Tide': 333,
  'Arizona Wildcats': 12,
  'Arkansas Razorbacks': 8,
  'BYU Cougars': 252,
  'Cal Baptist Lancers': 2856,
  'Clemson Tigers': 228,
  'Duke Blue Devils': 150,
  'Florida Gators': 57,
  'Furman Paladins': 231,
  'Georgia Bulldogs': 61,
  'Gonzaga Bulldogs': 2250,
  'Hawaii Rainbow Warriors': 62,
  'High Point Panthers': 2229,
  'Hofstra Pride': 2275,
  'Houston Cougars': 248,
  'Howard Bison': 47,
  'Idaho Vandals': 70,
  'Illinois Fighting Illini': 356,
  'Iowa Hawkeyes': 2294,
  'Iowa State Cyclones': 66,
  'Kansas Jayhawks': 2305,
  'Kennesaw State Owls': 2310,
  'Kentucky Wildcats': 96,
  'Lehigh Mountain Hawks': 322,
  'LIU Sharks': 2350,
  'Louisville Cardinals': 97,
  'McNeese Cowboys': 2377,
  'Miami (Ohio) RedHawks': 193,
  'Miami Hurricanes': 2390,
  'Michigan State Spartans': 127,
  'Michigan Wolverines': 130,
  'Missouri Tigers': 142,
  'NC State Wolfpack': 152,
  'Nebraska Cornhuskers': 158,
  'North Carolina Tar Heels': 153,
  'North Dakota State Bison': 2449,
  'Northern Iowa Panthers': 2460,
  'Ohio State Buckeyes': 194,
  'Penn Quakers': 219,
  'Prairie View A&M Panthers': 2483,
  'Purdue Boilermakers': 2509,
  'Queens Royals': 2885,
  'Saint Louis Billikens': 139,
  "Saint Mary's Gaels": 2608,
  'Santa Clara Broncos': 923,
  'Siena Saints': 2554,
  'SMU Mustangs': 2567,
  'South Florida Bulls': 58,
  "St. John's Red Storm": 2599,
  'TCU Horned Frogs': 2628,
  'Tennessee State Tigers': 2630,
  'Tennessee Volunteers': 2633,
  'Texas A&M Aggies': 245,
  'Texas Longhorns': 251,
  'Texas Tech Red Raiders': 2641,
  'Troy Trojans': 2653,
  'UCF Knights': 2116,
  'UCLA Bruins': 26,
  'UConn Huskies': 41,
  'UMBC Retrievers': 2439,
  'Utah State Aggies': 328,
  'Vanderbilt Commodores': 238,
  'VCU Rams': 2670,
  'Villanova Wildcats': 222,
  'Virginia Cavaliers': 258,
  'Wisconsin Badgers': 275,
  'Wright State Raiders': 2750,
}

async function fetchNextGame(teamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`

  let res
  try {
    res = await fetch(url)
    if (!res.ok) return null
  } catch {
    return null
  }

  const json = await res.json()
  const events = json.events ?? []
  const now = new Date()

  const upcoming = events
    .filter((e) => {
      const d = new Date(e.date)
      const completed = e.competitions?.[0]?.status?.type?.completed
      return d >= now || !completed
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  if (!upcoming.length) return null

  const game = upcoming[0]
  const comp = game.competitions?.[0]
  if (!comp) return null

  const opponent = comp.competitors?.find((c) => c.id !== String(teamId))
  const opponentName = opponent?.team?.displayName ?? 'TBD'
  const gameDate = new Date(game.date)

  return {
    next_matchup: `vs. ${opponentName}`,
    next_matchup_at: gameDate.toISOString(),
  }
}

async function main() {
  console.log('🏀 Starting player sync...\n')

  const { data: rows, error } = await supabase
    .from('players')
    .select('school_name')
    .order('school_name')

  if (error) {
    console.error('Supabase error:', error)
    process.exit(1)
  }

  const schools = [...new Set(rows.map((r) => r.school_name))]
  console.log(`Found ${schools.length} unique schools\n`)

  let logoFixed = 0
  let matchupFixed = 0
  const notInMap = []

  for (const school of schools) {
    const teamId = TEAM_IDS[school]

    if (!teamId) {
      notInMap.push(school)
      console.warn(`⚠️  No ESPN ID for: ${school}`)
      continue
    }

    const logoUrl = `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png`
    const gameInfo = await fetchNextGame(teamId)

    const update = {
      team_logo_url: logoUrl,
      next_matchup: gameInfo?.next_matchup ?? 'TBD',
      next_matchup_at: gameInfo?.next_matchup_at ?? null,
    }

    const { error: updateErr } = await supabase
      .from('players')
      .update(update)
      .eq('school_name', school)

    if (updateErr) {
      console.error(`  ❌ DB error for ${school}:`, updateErr.message)
    } else {
      logoFixed++
      if (gameInfo) matchupFixed++
      console.log(
        `  ✅ ${school} → logo updated, next: ${update.next_matchup}${
          update.next_matchup_at
            ? ` (${new Date(update.next_matchup_at).toLocaleDateString()})`
            : ''
        }`
      )
    }

    await new Promise((r) => setTimeout(r, 150))
  }

  console.log(`\n📊 Summary:`)
  console.log(`  Logos updated: ${logoFixed}`)
  console.log(`  Matchups found: ${matchupFixed}`)
  console.log(
    `  Missing from ID map: ${notInMap.length}${
      notInMap.length ? ' → ' + notInMap.join(', ') : ''
    }`
  )
  console.log('\n✅ Done!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

