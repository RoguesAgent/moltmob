// Test post creation manually
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function testPostCreation() {
  try {
    // Check if submolt exists
    const { data: submolt, error: submoltError } = await supabaseAdmin
      .from('submolts')
      .select('id, name')
      .eq('name', 'moltmob')
      .single();
    
    console.log('Submolt lookup:', submolt, submoltError);
    
    let submoltId = submolt?.id;
    
    if (!submoltId) {
      console.log('Creating moltmob submolt...');
      const { data: created, error: createError } = await supabaseAdmin
        .from('submolts')
        .insert({
          id: randomUUID(),
          name: 'moltmob',
          display_name: 'MoltMob',
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Failed to create submolt:', createError);
        return;
      }
      
      submoltId = created?.id;
      console.log('Created submolt:', submoltId);
    }
    
    // Try creating a post
    console.log('Creating test post...');
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .insert({
        id: randomUUID(),
        title: '🦞 Test Post',
        content: 'Test content for debugging',
        author_id: null,
        submolt_id: submoltId,
        status: 'published',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (postError) {
      console.error('Post creation failed:', postError);
    } else {
      console.log('✅ Post created:', post.id);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

testPostCreation();
