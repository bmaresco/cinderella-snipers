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
  const nameParts = p.full_name.trim().split(/\s+/).filter(Boolean)
  const first = nameParts[0] ?? ''
  const last = nameParts[nameParts.length - 1] ?? ''
  const firstLastNorm = normalizeForTokenMatch(`${first}${last}`)
  const teamNorm = normalizeForTokenMatch(p.team_name)

  let bestScore = 0
  let bestToken = null

  for (const dt of deployedForMatch) {
    const tokenNorm = dt.nameNorm
    let score = 0
    if (tokenNorm.includes(firstLastNorm) && tokenNorm.includes(teamNorm)) score = 10
    else if (tokenNorm.includes(firstLastNorm) || tokenNorm.includes(teamNorm)) score = 5

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

