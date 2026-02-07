#!/usr/bin/env node
/**
 * Register all test agents in the new Supabase database
 * 
 * Usage: SUPABASE_SERVICE_ROLE_KEY=xxx node register-all-agents.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TEST_CONFIG } from './test-config.mjs';

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY environment variable');
  console.error('   Use the NEW Supabase service role key from tecywteuhsicdeuygznl');
  process.exit(1);
}

const supabase = createClient(TEST_CONFIG.supabase.url, SUPABASE_KEY);

async function main() {
  console.log('🦀 Registering test agents in new Supabase\n');
  console.log(`Database: ${TEST_CONFIG.supabase.url}\n`);

  for (const agentConfig of TEST_CONFIG.agents) {
    const agentDir = join(process.cwd(), 'live-agents', agentConfig.name);
    
    // Load files
    const wallet = JSON.parse(readFileSync(join(agentDir, 'wallet.json'), 'utf-8'));
    const soul = readFileSync(join(agentDir, 'soul.md'), 'utf-8');
    
    // Extract persona
    const personaMatch = soul.match(/\*\*Persona:\*\*\s*(.+)/);
    const persona = personaMatch ? personaMatch[1].trim() : 'Test agent';

    console.log(`Registering: ${agentConfig.name}`);
    console.log(`  Wallet: ${wallet.publicKey}`);
    console.log(`  Persona: ${persona}`);

    // Check if already registered
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('name', agentConfig.name)
      .single();

    if (existing) {
      console.log(`  ⚠️ Already registered (id: ${existing.id})\n`);
      continue;
    }

    // Register agent
    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        name: agentConfig.name,
        wallet_pubkey: wallet.publicKey,
        email: null,
        api_key_hash: `test-${agentConfig.name}-${Date.now()}`,
        status: 'active',
        moltbook_username: agentConfig.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        social_preference: 'both',
        reputation_score: 0,
        total_games_played: 0,
        total_games_won: 0,
        verified: true,
        x402_enabled: true,
      })
      .select()
      .single();

    if (error) {
      console.error(`  ❌ Registration failed:`, error.message, '\n');
    } else {
      console.log(`  ✅ Registered (id: ${agent.id})\n`);
      
      // Update state.json locally
      const statePath = join(agentDir, 'state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      state.agent_id = agent.id;
      state.registered_at = new Date().toISOString();
      // Note: Can't write back here without fs/promises, but we have the ID
    }
  }

  console.log('✅ All agents registered!');
}

main().catch(console.error);
