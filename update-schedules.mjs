// update-schedules.mjs
// Updates next game fields for every team without touching team_logo_url.
// Prints one line per team:
//   - "School: ELIMINATED" OR
//   - "School: vs. <Opponent> — <Date/Time>" (uses "TBD" opponent when undecided)
//
// Run:
//   npm run update:schedules
// Requires env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function getEventStartMs(e) {
  const dateStr =
    e?.date ??
    e?.competitions?.[0]?.date ??
    e?.competitions?.[0]?.startDate ??
    e?.competitions?.[0]?.status?.date
  if (!dateStr) return null
  const ms = new Date(dateStr).getTime()
  return Number.isFinite(ms) ? ms : null
}

function scoreToNumber(score) {
  if (score == null) return null
  if (typeof score === 'number') return score
  if (typeof score === 'object' && score.value != null) return Number(score.value)
  const n = Number(score)
  return Number.isFinite(n) ? n : null
}

function parseTeamIdFromLogo(teamLogoUrl) {
  // ESPN team logos use: .../500/<teamId>.png
  const match = teamLogoUrl?.match(/\/(\d+)\.png$/)
  return match?.[1] ?? null
}

function pickUpcomingEvent(events, teamId, nowMs) {
  // Use a small grace window so "next" doesn't disappear due to tiny timestamp mismatches.
  const GRACE_MS = 6 * 60 * 60 * 1000

  const next = (events ?? [])
    .filter((e) => {
      const completed = e?.competitions?.[0]?.status?.type?.completed
      if (completed) return false
      const startMs = getEventStartMs(e)
      return startMs != null && startMs >= nowMs - GRACE_MS
    })
    .sort((a, b) => getEventStartMs(a) - getEventStartMs(b))[0]

  if (!next) return null

  const comp = next.competitions?.[0]
  const opponents = comp?.competitors ?? []
  const opp = opponents.find((c) => c.id !== String(teamId))

  const oppName =
    opp?.team?.displayName ?? opp?.team?.shortDisplayName ?? opp?.team?.abbreviation ?? 'TBD'

  const startMs = getEventStartMs(next)
  if (startMs == null) return null

  return {
    next_matchup: `vs. ${oppName}`,
    next_matchup_at: new Date(startMs).toISOString(),
  }
}

function inferEliminatedIfLost(events, teamId) {
  // Only use scores when inferring eliminated:
  // - no upcoming postseason event
  // - most recent completed postseason game was a loss
  const completed = (events ?? [])
    .filter((e) => e?.competitions?.[0]?.status?.type?.completed)
    .filter((e) => getEventStartMs(e) != null)
    .sort((a, b) => getEventStartMs(b) - getEventStartMs(a))[0]

  if (!completed) return null

  const comp = completed.competitions?.[0]
  const competitors = comp?.competitors ?? []
  const teamComp = competitors.find((c) => c.id === String(teamId))
  const oppComp = competitors.find((c) => c.id !== String(teamId))

  if (!teamComp || !oppComp) return null

  const teamScore = scoreToNumber(teamComp.score)
  const oppScore = scoreToNumber(oppComp.score)
  if (teamScore == null || oppScore == null) return null

  if (teamScore >= oppScore) return null

  return {
    next_matchup: 'ELIMINATED',
    next_matchup_at: null,
  }
}

async function fetchNextForTeam(teamId) {
  const BASE =
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

  const fetchSchedule = async (seasontype) => {
    const res = await fetch(`${BASE}/${teamId}/schedule?seasontype=${seasontype}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    return json?.events ?? []
  }

  const nowMs = Date.now()

  // 1) Postseason first
  const postEvents = await fetchSchedule(3)
  if (postEvents) {
    const upcomingPost = pickUpcomingEvent(postEvents, teamId, nowMs)
    if (upcomingPost) return upcomingPost

    const eliminated = inferEliminatedIfLost(postEvents, teamId)
    if (eliminated) return eliminated
  }

  // 2) Fall back to regular season for non-tournament teams (and for cases where postseason parsing fails)
  const regEvents = await fetchSchedule(2)
  if (regEvents) {
    const upcomingReg = pickUpcomingEvent(regEvents, teamId, nowMs)
    if (upcomingReg) return upcomingReg
  }

  // If we get here, ESPN isn't returning any suitable "next" event.
  // Requirement says: no teams should just say TBD.
  // We intentionally return null so caller can avoid writing partial data.
  return null
}

function formatDateTimeForConsole(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  const now = new Date()
  const isToday =
    dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate()

  if (isToday) {
    const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `Today ${time}`
  }

  return dt.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function main() {
  const { data: rows, error } = await supabase
    .from('players')
    .select('school_name, team_logo_url')
    .order('school_name')

  if (error) {
    console.error('Supabase error:', error)
    process.exit(1)
  }

  // Build a distinct list of schools -> one logo url per school.
  const bySchool = new Map()
  for (const r of rows ?? []) {
    if (!r?.school_name) continue
    if (!bySchool.has(r.school_name) && r.team_logo_url) {
      bySchool.set(r.school_name, r.team_logo_url)
    } else if (bySchool.has(r.school_name) && !bySchool.get(r.school_name) && r.team_logo_url) {
      bySchool.set(r.school_name, r.team_logo_url)
    } else if (!bySchool.has(r.school_name)) {
      bySchool.set(r.school_name, r.team_logo_url ?? null)
    }
  }

  const schools = [...bySchool.keys()]
  if (!schools.length) {
    console.log('No schools found.')
    return
  }

  console.log(`Updating schedules for ${schools.length} teams...`)

  let updated = 0
  let skipped = 0

  for (const school of schools) {
    const teamLogoUrl = bySchool.get(school)
    const teamId = parseTeamIdFromLogo(teamLogoUrl)
    if (!teamId) {
      console.log(`${school}: SKIPPED (no ESPN team id in team_logo_url)`)
      skipped++
      continue
    }

    const next = await fetchNextForTeam(teamId)
    if (!next) {
      console.log(`${school}: ELIMINATION_UNKNOWN (no next game found)`)
      skipped++
      continue
    }

    const payload = {
      next_matchup: next.next_matchup,
      next_matchup_at: next.next_matchup_at,
    }

    const { error: updateErr } = await supabase
      .from('players')
      .update(payload)
      .eq('school_name', school)

    if (updateErr) {
      console.error(`  ❌ Failed updating ${school}:`, updateErr.message)
      continue
    }

    if (next.next_matchup === 'ELIMINATED') {
      console.log(`${school}: ELIMINATED`)
    } else {
      // next_matchup looks like "vs. X"
      const opponent = next.next_matchup.replace(/^vs\.\s*/i, '')
      const dateTime = formatDateTimeForConsole(next.next_matchup_at)
      console.log(`${school}: vs. ${opponent} — ${dateTime}`)
    }

    updated++
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log(`\nDone. Updated ${updated} teams; skipped ${skipped}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

