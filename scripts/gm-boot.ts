#!/usr/bin/env tsx
/**
 * GM Agent Boot Script
 * 
 * Run this on GM agent startup to:
 * 1. Recover any active/paused pods from DB
 * 2. Resume checkpointed game state
 * 3. Post recovery messages to Moltbook
 * 
 * Usage: npx tsx scripts/gm-boot.ts [--dry-run]
 */

import { supabaseAdmin } from '../web/lib/supabase';
import { recoverAllActivePods, createResilientRunner, getActivePods } from '../web/lib/game/runner-resume';
import { MoltbookService } from '../web/lib/game/moltbook-service';

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY || 'moltbook_sk_QAmJS68bMJ_Y3WCKDhSUywE1qvqhePYw';
const DRY_RUN = process.argv.includes('--dry-run');

async function bootGM() {
  console.log('🦀 MoltMob GM Agent Booting...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // 1. Check for active pods
  const activePods = await getActivePods();
  console.log(`Found ${activePods.length} active/paused pods`);

  if (activePods.length === 0) {
    console.log('No pods to recover. Ready for new games.');
    process.exit(0);
  }

  // 2. Show pod details
  const { data: pods } = await supabaseAdmin
    .from('game_pods')
    .select('id, pod_number, status, current_phase, current_round')
    .in('id', activePods);

  console.log('\nActive Pods:');
  pods?.forEach(p => {
    console.log(`  #${p.pod_number}: ${p.status} | ${p.current_phase} R${p.current_round} | ${p.id}`);
  });

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Skipping recovery. Run without --dry-run to recover.');
    process.exit(0);
  }

  // 3. Create Moltbook service
  const moltbookService = new MoltbookService({
    apiBaseUrl: 'https://www.moltbook.com/api/v1',
    apiKey: MOLTBOOK_API_KEY,
    submolt: 'moltmob',
    testMode: false,
  });

  const config = { moltbookService };

  // 4. Recover all active pods
  console.log('\n🔄 Recovering pods...\n');
  const results = await recoverAllActivePods(config);

  // 5. Report results
  console.log('\n📊 Recovery Results:');
  console.log('═════════════════════════════════');
  
  let success = 0;
  let failed = 0;

  results.forEach(result => {
    if (result.recovered) {
      success++;
      const pod = result.runner?.getPod();
      console.log(`✅ Pod #${pod?.pod_number}: ${pod?.current_phase} R${pod?.current_round}`);
    } else {
      failed++;
      console.log(`❌ Pod ${result.runner?.getPod()?.id}: ${result.error}`);
    }
  });

  console.log('═════════════════════════════════');
  console.log(`${success}/${results.length} pods recovered`);

  if (failed > 0) {
    console.error(`\n⚠️ ${failed} pods failed to recover`);
    process.exit(1);
  }

  console.log('\n🦐 GM Agent ready for duty.');
  process.exit(0);
}

bootGM().catch(err => {
  console.error('Boot failed:', err);
  process.exit(1);
});
