#!/usr/bin/env node
// Orbit Axis :: local development launcher (Update 4.0.2).
//
// Pins the database to the LOCAL Supabase stack before anything reads
// configuration, so `.env.local` (which holds the hosted project URL) cannot
// pull a development session onto production. The port comes from the tracked
// supabase/config.toml, so nobody copies port numbers between terminals.

import { localSupabaseUrl, LOCAL_ANON_KEY } from "../lib/env/environment.js";

// Pre-set values win over .env.local — see loadEnvLocal() in lib/local-llm/config.js.
process.env.ORBIT_ENVIRONMENT = "local";
process.env.SUPABASE_URL ||= localSupabaseUrl();
process.env.SUPABASE_ANON_KEY ||= LOCAL_ANON_KEY;
// A service-role key is never needed for ordinary local development.
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

await import("../server.js");
