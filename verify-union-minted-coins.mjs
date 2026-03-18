// verify-union-minted-coins.mjs
// Verifies which players get matched (linked) by the app's token->player heuristic
// across multiple creator wallets.
//
// Usage:
//   node verify-union-minted-coins.mjs <wallet1> <wallet2> ...
//
// Output:
// - players matched vs not matched (this mirrors app/page.tsx assignment)
// - which minted contracts are covered by at least one matched player
// - which minted contracts are missing from matches

import { createClient } from '@supabase/supabase-js'
import { getTokensByCreatorAddress } from './lib/clanker.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const wallets = process.argv.slice(2).filter(Boolean)
if (!wallets.length) {
  console.error('Missing wallets. Usage: node verify-union-minted-coins.mjs <wallet1> <wallet2> ...')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function normalizeForTokenMatch(input) {
  return (input ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const NAME_TRAILING_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi'])

function getNameNormCandidates(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  const stripped = [...parts]

  // Strip suffixes like "Jr.", "II", "III" so the last name part is correct.
  while (stripped.length > 0) {
    const last = stripped[stripped.length - 1] ?? ''
    const lastNorm = normalizeForTokenMatch(last)
    if (NAME_TRAILING_SUFFIXES.has(lastNorm)) stripped.pop()
    else break
  }

  if (stripped.length === 0) return []

  const first = stripped[0] ?? ''
  const last1 = stripped[stripped.length - 1] ?? ''

  const set = new Set()
  if (first && last1) set.add(normalizeForTokenMatch(`${first}${last1}`))

  // If we have a middle name (or compound surname like "Vander Wal" / "De Ridder"),
  // also try using the last two words.
  if (stripped.length >= 3) {
    const last2 = stripped.slice(-2).join(' ')
    set.add(normalizeForTokenMatch(`${first}${last2}`))
  }

  return Array.from(set)
}

async function main() {
  const tokenLists = await Promise.all(wallets.map((w) => getTokensByCreatorAddress(w, { cacheTtlMs: 0, limit: 50 })))

  // De-dupe by contract address like the app does when we added multi-wallet support.
  const tokenByContract = new Map()
  for (const list of tokenLists) {
    for (const t of list) {
      if (!t?.contract_address) continue
      const key = t.contract_address.toLowerCase()
      if (!tokenByContract.has(key)) tokenByContract.set(key, t)
    }
  }

  const deployedTokens = Array.from(tokenByContract.values())
  const walletContracts = new Set(deployedTokens.map((t) => t.contract_address.toLowerCase()))

  console.log(`Wallets provided: ${wallets.length}`)
  console.log(`Distinct minted contracts (de-duped): ${walletContracts.size}`)

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, full_name, team_name')
    .order('full_name', { ascending: true })

  if (playersErr) {
    console.error('Supabase error:', playersErr)
    process.exit(1)
  }

  const deployedForMatch = deployedTokens.map((token) => ({
    token,
    nameNorm: normalizeForTokenMatch(token.name ?? ''),
  }))

  let matchedPlayers = 0
  let notMatchedPlayers = 0
  const usedContracts = new Set()
  const notMatchedPlayersList = []

  for (const p of players ?? []) {
    const teamNorm = normalizeForTokenMatch(p.team_name ?? '')
    const nameNormCandidates = getNameNormCandidates(p.full_name)

    let bestScore = 0
    let bestToken = null

    for (const dt of deployedForMatch) {
      const tokenNorm = dt.nameNorm
      const nameMatches = nameNormCandidates.some((n) => n && tokenNorm.includes(n))
      const teamMatches = teamNorm ? tokenNorm.includes(teamNorm) : false

      let score = 0
      if (nameMatches && teamMatches) score = 10
      else if (nameMatches || teamMatches) score = 5

      if (score > bestScore) {
        bestScore = score
        bestToken = dt.token
      }
    }

    if (bestToken?.contract_address && bestScore > 0) {
      matchedPlayers++
      usedContracts.add(bestToken.contract_address.toLowerCase())
    } else {
      notMatchedPlayers++
      notMatchedPlayersList.push({
        full_name: p.full_name,
        team_name: p.team_name,
        bestScore,
      })
    }
  }

  const usedContractsCount = usedContracts.size
  const missingContractsCount = walletContracts.size - usedContractsCount

  console.log(`\nPlayers rows: ${players?.length ?? 0}`)
  console.log(`Players matched to a token from the union: ${matchedPlayers}`)
  console.log(`Players NOT matched from the union: ${notMatchedPlayers}`)
  console.log(`\nDistinct wallet contracts used by matches: ${usedContractsCount}/${walletContracts.size}`)
  console.log(`Distinct wallet contracts missing from matches: ${missingContractsCount}`)

  if (notMatchedPlayersList.length) {
    console.log(`\nNOT matched players (${notMatchedPlayersList.length}):`)
    for (const ex of notMatchedPlayersList) {
      console.log(`- ${ex.full_name} — ${ex.team_name}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

