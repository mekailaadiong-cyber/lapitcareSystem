# LapitCare pre-enhancement recovery copy

Created 2026-10-19 before feature enhancements.

- `data/` contains the original JSON seed records used by the local prototype.
- `schema.sql` contains the original Supabase table, RLS policies, triggers, and RPC definitions.

To restore local seed data, copy the desired JSON files from `data/` back into the project `data/` folder. To restore the schema source, copy `schema.sql` back to `supabase/schema.sql`.

This is a source-level recovery copy only. It does not contain browser `localStorage`, a Supabase database dump, or credentials. The project has no configured Supabase URL/key, so no remote database was reachable or modified during this backup.
