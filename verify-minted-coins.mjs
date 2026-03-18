// verify-minted-coins.mjs
// Verifies that every minted token contract from the creator wallet has at least
// one linked player row in Supabase.
//
// Prints:
// - total minted tokens/contracts from the wallet
// - total players rows
// - players linked vs not linked (clanker_contract_address null)
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

const { data: players, error } = await supabase.from('players').select('id, clanker_contract_address')

if (error) {
  console.error('Supabase error:', error)
  process.exit(1)
}

const totalPlayers = players.length
let linkedPlayers = 0
let unlinkedPlayers = 0
const playerContracts = new Set()

for (const p of players) {
  if (p.clanker_contract_address) {
    linkedPlayers++
    playerContracts.add(p.clanker_contract_address.toLowerCase())
  } else {
    unlinkedPlayers++
  }
}

let linkedMintedContracts = 0
for (const c of walletContracts) {
  if (playerContracts.has(c)) linkedMintedContracts++
}

const missingMintedContracts = walletContracts.size - linkedMintedContracts

console.log(`\nPlayers table rows: ${totalPlayers}`)
console.log(`Players linked (clanker_contract_address != null): ${linkedPlayers}`)
console.log(`Players unlinked (clanker_contract_address == null): ${unlinkedPlayers}`)

console.log(`\nDistinct token contracts linked in players: ${playerContracts.size}`)
console.log(`Wallet contracts covered by players: ${linkedMintedContracts}/${walletContracts.size}`)
console.log(`Wallet contracts missing from players: ${missingMintedContracts}`)

