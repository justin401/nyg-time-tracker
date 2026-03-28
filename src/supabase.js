import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://gdyfcqpbbehozyyjrnah.supabase.co";
const supabaseAnonKey = "sb_publishable_Y3JZyVPIcnhPEOIgwxfgZA_fKGGJwHJ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
