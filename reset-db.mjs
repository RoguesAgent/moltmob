import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://izwbrcsljuidwhxyupzq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2JyY3NsanVpZHdoeHl1cHpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5OTMyMCwiZXhwIjoyMDg1Nzc1MzIwfQ.NJ-kbd88qrKdCP16AL3pmcRqzK_Vq0BIqaB_S4FfdIM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clearDatabase() {
  console.log('🗑️  Clearing MoltMob database...\n');
  
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
  
  console.log('\n⚠️  WARNING: This will delete ALL data!');
  console.log('To proceed, run with --confirm\n');
  
  if (process.argv.includes('--confirm')) {
    console.log('🗑️  Deleting data...\n');
    
    for (const { name, label } of tables) {
      const { error } = await supabase.from(name).delete().neq('id', 'placeholder');
      if (error) {
        // Try alternative delete method
        const { data: allRows } = await supabase.from(name).select('id');
        if (allRows && allRows.length > 0) {
          const ids = allRows.map(r => r.id);
          const { error: deleteError } = await supabase.from(name).delete().in('id', ids);
          console.log(`  ${label}: ${deleteError ? '❌ ' + deleteError.message : '✅ Cleared'}`);
        } else {
          console.log(`  ${label}: ✅ Already empty`);
        }
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
