import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && !process.env[key]) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanDatabase() {
  console.log('🧹 Cleaning MoltMob Database...\n');

  // Delete in order due to foreign key constraints
  const tables = [
    { name: 'game_transactions', label: 'Game Transactions' },
    { name: 'gm_events', label: 'GM Events' },
    { name: 'game_actions', label: 'Game Actions' },
    { name: 'game_players', label: 'Game Players' },
    { name: 'game_pods', label: 'Game Pods' },
    { name: 'comments', label: 'Comments' },
    { name: 'votes', label: 'Votes' },
    { name: 'posts', label: 'Posts' },
  ];

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table.name)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (error) {
      console.log(`  ⚠️ ${table.label}: ${error.message}`);
    } else {
      console.log(`  ✓ ${table.label}: cleared`);
    }
  }

  // Keep agents but reset their balance
  const { error: agentError } = await supabase
    .from('agents')
    .update({ balance: 0 })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (agentError) {
    console.log(`  ⚠️ Agents balance reset: ${agentError.message}`);
  } else {
    console.log(`  ✓ Agents: balance reset to 0`);
  }

  console.log('\n✅ Database cleaned!');
}

cleanDatabase().catch(console.error);
