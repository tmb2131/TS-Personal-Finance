# Migrations

Versions are zero-padded sequential numbers (`001` … `050`), not the Supabase
CLI's default `YYYYMMDDHHMMSS` timestamps. The remote ledger
(`supabase_migrations.schema_migrations`) matches these filenames exactly, so
`version` and file prefix can be compared directly.

**Next migration is `051`.**

Applying via the MCP `apply_migration` tool mints a timestamp version rather
than a number. If you use it, rewrite the recorded version afterwards to match
the filename, or the two drift apart. `049` and `050` were applied that way and
have been corrected.

## Known anomalies

Three numbers were used twice. The colliding files carry a `b` suffix to
disambiguate; the suffix is not a chronology claim, only a tiebreak. The
un-suffixed file of each pair is the one the ledger already recorded.

| File | Status |
| --- | --- |
| `036b_move_accounts_kids_recurring_to_app_inputs.sql` | **Not applied. Do not apply.** Superseded by `048`. |
| `037b_yoy_bridge_metadata.sql` | Applied; recorded as version `037b`. |
| `038b_ensure_user_profile_rpc.sql` | Superseded by `039`, which recreates the same function. Not separately recorded. |

### `030_add_budget_input_mode.sql` — not applied

Verified against production on 2026-08-14:

- `user_profiles.budget_input_mode` still exists. The migration drops it. The
  column is referenced nowhere in the codebase, so it is dead weight rather
  than a live problem.
- 115 `budget_targets` rows still carry `data_source = 'google_sheet'` across
  five users. The migration normalises them to `manual`. Budget targets are no
  longer synced from the sheet, and the CRUD routes only permit edit/delete on
  `manual` rows, so those rows are not editable in-app.
- **None of the 115 belong to the primary user**, whose 25 budget rows are all
  `manual` and editable. This is why the gap went unnoticed.

Applying it mutates other users' rows, so it has been left outstanding rather
than run as part of a numbering cleanup.

### `036b` — superseded, must not be applied

`036b` moved account balances, kids accounts and recurring payments to
app-managed inputs by flipping `google_sheet` rows to `manual`. Migration `048`
reversed that decision for accounts: its own comment records that `036` left the
master-workbook balances with no way to refresh, so a separate accounts
importer was added.

That importer writes `data_source: 'google_sheet'` deliberately
(`lib/import-accounts-sheet.ts`), and its delete-and-replace step scopes on
`data_source = 'google_sheet'` (`lib/sync-google-sheet.ts`). The 39 rows
currently carrying that value are live and correct — freshest `date_updated` is
2026-07-31. Running `036b` now would flip them to `manual` and break the
importer's ability to reconcile removals.

## Ledger backup

`public._schema_migrations_backup_20260814` holds the ledger as it stood before
the version numbers were reconciled. Drop it once you are satisfied.
