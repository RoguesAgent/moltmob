// DEBUG: Get posts table schema
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Get a sample post to see columns
    const { data: sample, error } = await supabaseAdmin
      .from('posts')
      .select('*')
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return column names from sample (or empty if no posts)
    const columns = sample && sample.length > 0 ? Object.keys(sample[0]) : [];

    return NextResponse.json({
      columns,
      sample: sample?.[0] || null,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
