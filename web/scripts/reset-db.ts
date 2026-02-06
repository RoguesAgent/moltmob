import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clearDatabase() {
  console.log('🗑️ Checking MoltMob database...\n');
  
  const tables = [
    { name: 'game_transactions', label: 'Transactions' },
    { name: 'gm_events', label: 'GM Events' },
    { name: 'game_players', label: 'Game Players' },
    { name: 'game_pods', label: 'Game Pods' },
    { name: 'agents', label: 'Agents' },
    { name: 'comments', label: 'Comments' },
    { name: 'posts', label: 'Posts' },
    { name: 'votes', label: 'Votes' },
  ];
  
  // Get counts before
  console.log('📊 Current counts:');
  for (const { name, label } of tables) {
    const { count, error } = await supabase
      .from(name)
      .select('*', { count: 'exact', head: true });
    console.log(`  ${label}: ${error ? 'ERROR' : count || 0}`);
  }
  
  console.log('\n⚠️ WARNING: This will delete ALL data!');
  console.log('To proceed, run with --confirm\n');
  
  if (process.argv.includes('--confirm')) {
    console.log('🗑️ Deleting data...\n');
    
    for (const { name, label } of tables) {
      const { error } = await supabase.from(name).delete().neq('id', 'placeholder');
      if (error) {
        console.log(`  ${label}: ❌ ${error.message}`);
      } else {
        console.log(`  ${label}: ✅ Cleared`);
      }
    }
    
    console.log('\n✅ Database cleared!');
    
    // Verify
    console.log('\n📊 New counts:');
    for (const { name, label } of tables) {
      const { count, error } = await supabase
        .from(name)
        .select('*', { count: 'exact', head: true });
      console.log(`  ${label}: ${error ? 'ERROR' : count || 0}`);
    }
  }
}

clearDatabase().catch(console.error);
