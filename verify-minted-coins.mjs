// verify-minted-coins.mjs
// Verifies that every minted token contract from the creator wallet has at least
// one linked player row in Supabase.
//
// Note: the "linked contract" column name in Supabase may vary (some deployments
// use different schema). This script detects the best matching column
// automatically from the `players` row keys and then computes:
// - total players rows
// - players linked/unlinked (contract column is null vs not null)
// - how many wallet contracts appear in the players table
//
// Prints:
// - total minted tokens/contracts from the wallet
// - total players rows
// - players linked vs not linked (detected contract column null)
// - token contract coverage (how many wallet contracts appear in players)

import { createClient } from '@supabase/supabase-js'
import { getTokensByCreatorAddress } from './lib/clanker.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const PLAYER_TOKEN_DEPLOYER_WALLET = '0xe2a26dD1AB4942C5a500093161f33368e27953a1'

const tokens = await getTokensByCreatorAddress(PLAYER_TOKEN_DEPLOYER_WALLET, { cacheTtlMs: 0, limit: 50 })
const walletContracts = new Set(tokens.map((t) => t.contract_address.toLowerCase()))

console.log(`Wallet minted tokens fetched: ${tokens.length}`)
console.log(`Distinct minted contracts: ${walletContracts.size}`)

// Detect the contract-address column used by the `players` table.
const { data: sampleRows, error: sampleErr } = await supabase
  .from('players')
  .select('*')
  .limit(1)

if (sampleErr) {
  console.error('Supabase error (detect column):', sampleErr)
  process.exit(1)
}

const sample = sampleRows?.[0]
if (!sample) {
  console.error('No rows found in `players` table.')
  process.exit(1)
}

const keys = Object.keys(sample)
const lowerKeys = new Map(keys.map((k) => [k.toLowerCase(), k]))

const preferredCandidates = [
  'clanker_contract_address',
  'contract_address',
  'clanker_contract',
  'token_contract_address',
  'token_contract',
]

let contractCol = null
for (const cand of preferredCandidates) {
  if (lowerKeys.has(cand)) {
    contractCol = lowerKeys.get(cand)
    break
  }
}

if (!contractCol) {
  // Fallback: pick the key that contains "contract" or ends with "address"
  const ranked = keys
    .map((k) => {
      const lk = k.toLowerCase()
      let score = 0
      if (lk.includes('contract')) score += 5
      if (lk.includes('clanker')) score += 3
      if (lk.endsWith('address')) score += 2
      if (lk.includes('address')) score += 1
      return { k, score }
    })
    .sort((a, b) => b.score - a.score)

  if (ranked[0]?.score > 0) contractCol = ranked[0].k
}

if (!contractCol) {
  console.error('Could not detect a contract-address column in `players` table. Columns:', keys)
  process.exit(1)
}

const { data: players, error: playersErr } = await supabase
  .from('players')
  .select(`id, ${contractCol}`)

if (playersErr) {
  console.error('Supabase error:', playersErr)
  process.exit(1)
}

const totalPlayers = players.length
let linkedPlayers = 0
let unlinkedPlayers = 0
const playerContracts = new Set()

for (const p of players) {
  const v = p[contractCol]
  if (v) {
    linkedPlayers++
    playerContracts.add(String(v).toLowerCase())
  } else {
    unlinkedPlayers++
  }
}

let linkedMintedContracts = 0
for (const c of walletContracts) {
  if (playerContracts.has(c)) linkedMintedContracts++
}

const missingMintedContracts = walletContracts.size - linkedMintedContracts

const walletByContract = new Map(tokens.map((t) => [t.contract_address.toLowerCase(), t]))
const missingExamples = []
for (const c of walletContracts) {
  if (!playerContracts.has(c)) {
    const t = walletByContract.get(c)
    if (t) missingExamples.push(`${t.name} (${c})`)
    else missingExamples.push(`unknown (${c})`)
    if (missingExamples.length >= 10) break
  }
}

console.log(`\nDetected players contract column: ${contractCol}`)
console.log(`Players table rows: ${totalPlayers}`)
console.log(`Players linked (contract col != null): ${linkedPlayers}`)
console.log(`Players unlinked (contract col == null): ${unlinkedPlayers}`)

console.log(`\nDistinct token contracts linked in players: ${playerContracts.size}`)
console.log(`Wallet contracts covered by players: ${linkedMintedContracts}/${walletContracts.size}`)
console.log(`Wallet contracts missing from players: ${missingMintedContracts}`)
if (missingExamples.length) {
  console.log('\nMissing wallet contracts examples:')
  for (const ex of missingExamples) console.log(`- ${ex}`)
}

