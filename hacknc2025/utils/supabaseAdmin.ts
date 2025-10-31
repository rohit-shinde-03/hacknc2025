import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
    "Load .env.local or export env vars before running server scripts."
  );
}

const supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });
export default supabaseAdmin;
