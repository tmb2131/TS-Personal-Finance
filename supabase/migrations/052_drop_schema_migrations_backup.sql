-- Drop the pre-renumbering ledger backup.
--
-- `public._schema_migrations_backup_20260814` held
-- `supabase_migrations.schema_migrations` as it stood before the version
-- numbers were reconciled with the migration filenames. It has served its
-- purpose: every row maps by name to a row still in the live ledger, and each
-- row's `statements` are the same SQL already committed under
-- supabase/migrations/. The five pre-renumbering timestamp versions it alone
-- recorded are written down in supabase/migrations/README.md.
--
-- It also sat in the PostgREST-exposed `public` schema with RLS disabled and
-- full CRUD granted to `anon` and `authenticated`, which made the complete
-- schema DDL — RLS policy bodies included — readable and writable with the
-- public anon key. Dropping it removes the exposure rather than gating it.

DROP TABLE IF EXISTS public._schema_migrations_backup_20260814;
