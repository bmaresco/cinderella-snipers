import { createClient } from '@supabase/supabase-js'
import { getTokensByCreatorAddress } from './lib/clanker.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const wallet = process.argv[2] ?? process.env.PLAYER_TOKEN_DEPLOYER_WALLET
if (!wallet) {
  console.error('Missing wallet. Usage: node verify-minted-coins.mjs <walletAddress>')
  process.exit(1)
}

const tokens = await getTokensByCreatorAddress(wallet, { cacheTtlMs: 0, limit: 50 })
const walletContracts = new Set(tokens.map((t) => t.contract_address.toLowerCase()))

console.log(`Wallet minted tokens fetched: ${tokens.length}`)
console.log(`Distinct minted contracts: ${walletContracts.size}`)

function normalizeForTokenMatch(input) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '')
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

// Pull the fields needed to reproduce the app's matching algorithm.
const { data: players, error: playersErr } = await supabase
  .from('players')
  .select('id, full_name, team_name')

if (playersErr) {
  console.error('Supabase error:', playersErr)
  process.exit(1)
}

const totalPlayers = players.length

const deployedForMatch = tokens.map((token) => ({
  token,
  nameNorm: normalizeForTokenMatch(token.name ?? ''),
}))

let linkedPlayers = 0
let unlinkedPlayers = 0
const usedTokenContracts = new Set()

for (const p of players) {
  const teamNorm = normalizeForTokenMatch(p.team_name)
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

  if (bestToken && bestToken.contract_address) {
    linkedPlayers++
    usedTokenContracts.add(bestToken.contract_address.toLowerCase())
  } else {
    unlinkedPlayers++
  }
}

let usedMintedContracts = 0
for (const c of walletContracts) {
  if (usedTokenContracts.has(c)) usedMintedContracts++
}

const missingMintedContracts = walletContracts.size - usedMintedContracts

console.log(`\nPlayers rows: ${totalPlayers}`)
console.log(`Players matched to a token from this wallet: ${linkedPlayers}`)
console.log(`Players NOT matched from this wallet: ${unlinkedPlayers}`)
console.log(`\nDistinct wallet contracts matched to at least one player: ${usedMintedContracts}/${walletContracts.size}`)
console.log(`Distinct wallet contracts missing from matches: ${missingMintedContracts}`)

