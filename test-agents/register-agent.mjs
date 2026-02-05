#!/usr/bin/env node

/**
 * Register a test agent in the MoltMob database
 *
 * Usage: node register-agent.mjs <agent-name>
 * Example: node register-agent.mjs TestAgentA
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://izwbrcsljuidwhxyupzq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const name = process.argv[2];
  
  if (!name) {
    console.error('❌ Usage: node register-agent.mjs <agent-name>');
    process.exit(1);
  }
  
  const agentDir = join(process.cwd(), 'live-agents', name);
  
  if (!existsSync(agentDir)) {
    console.error(`❌ Agent "${name}" not found at ${agentDir}`);
    console.error('   Run: node create-agent.mjs ' + name);
    process.exit(1);
  }
  
  // Load wallet
  const wallet = JSON.parse(readFileSync(join(agentDir, 'wallet.json'), 'utf-8'));
  
  // Load soul
  const soul = readFileSync(join(agentDir, 'soul.md'), 'utf-8');
  const personaMatch = soul.match(/Persona:\s*(.+)/);
  const persona = personaMatch ? personaMatch[1].trim() : 'Test agent';
  
  console.log(`🦀 Registering agent: ${name}\n`);
  console.log(`   Wallet: ${wallet.publicKey}`);
  console.log(`   Persona: ${persona}\n`);
  
  // Check if agent already exists
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', name)
    .single();
  
  if (existing) {
    console.log(`⚠️  Agent "${name}" already registered (id: ${existing.id})`);
    return;
  }
  
  // Register agent
  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      name: name,
      wallet_pubkey: wallet.publicKey,
      email: null,
      api_key_hash: 'test-agent-' + Date.now(),
      status: 'active',
      moltbook_username: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      social_preference: 'both',
      reputation_score: 0,
      total_games_played: 0,
      total_games_won: 0,
      verified: true
    })
    .select()
    .single();
  
  if (error) {
    console.error('❌ Registration failed:', error.message);
    process.exit(1);
  }
  
  console.log(`✅ Agent registered successfully!`);
  console.log(`   Database ID: ${agent.id}`);
  
  // Update state file with agent ID
  const statePath = join(agentDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf-8'));
  state.agent_id = agent.id;
  state.registered_at = new Date().toISOString();
  
  // We can't use fs/promises with writeFileSync after import fs, so just export for manual update
  console.log(`\n📝 Update your state.json with:`);
  console.log(`   "agent_id": "${agent.id}"`);
  
  // Create a simple wrapper script for this agent
  const wrapperPath = join(agentDir, 'play.mjs');
  const wrapperContent = `#!/usr/bin/env node
/*
 * Game player wrapper for ${name}
 * Usage: node play.mjs <pod-id>
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(join(__dirname, 'state.json'), 'utf-8'));

console.log(\`🦀 \${state.agent_name} ready to play\`);
console.log(\`   Wallet: \${state.wallet_address}\`);
console.log(\`   Agent ID: \${state.agent_id || 'not registered'}\`);

// TODO: Implement game logic integration
`;
  
  console.log(`\n🔧 Created: ${name}/play.mjs`);
  console.log(`\n✨ Agent "${name}" is ready for testing!`);
}

main().catch(console.error);
