import { createClient } from '@supabase/supabase-js';

export function getSupabase(env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY environment variables');
    }
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
