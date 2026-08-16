/**
 * The shape of the user's own Supabase project, as a list of numbered migrations the app carries
 * with it — and the answer to "how will anyone know their project is out of date?".
 *
 * Every user administers their own database. There is no deploy step that could touch it, no
 * migration runner watching it, and no way to reach them if a release ever needs a change up there.
 * So the app is the thing that knows: it ships the migrations, it can read which one a project has
 * reached, and it can hand the missing ones to the user's own SQL editor (lib/sync/supabase.ts).
 *
 * ---- the rules that make this work ----
 *
 * 1. **Append only.** A migration that has shipped is never edited — it has already run on somebody
 *    else's database, where an edit would simply never be applied. A mistake is fixed by adding the
 *    next number, exactly as it would be in any migration folder.
 * 2. **Idempotent.** Every statement is guarded (`if not exists`, `or replace`, `drop … if
 *    exists`), so re-running one is a no-op. That is what lets setup be a button rather than a
 *    one-time ritual nobody dares repeat, and what makes a half-finished run safe to retry.
 * 3. **Additive, so an older device keeps working.** Two devices can be on two releases for weeks —
 *    the newer one migrates the project, and the older one has to go on syncing against it. A
 *    migration that dropped a column the old app still writes would break the phone in someone's
 *    pocket, so a removal ships as: stop writing it (one release), drop it (a later one).
 *
 * ---- why the list is expected to stay short ----
 *
 * An event lives inside a `jsonb` column, so a release that adds a field to a guest, a table or the
 * invitation needs nothing here at all. That is the whole reason the table is shaped the way it is.
 */

/** One table holds every record, keyed by (user, kind, id). A table per kind would mean a migration
 * in every user's own project each time the app grows one. */
export const TABLE = 'guestseat_records';

/**
 * Where the project records which migration it has reached: an ordinary row of the app's own table.
 *
 * Deliberately not a table of its own, which would be a migration to create the thing that tracks
 * migrations. A row costs nothing, is readable with the key the device already has, and is covered
 * by the same row-level-security rule as everything else. `kind` is outside the app's list of
 * synced kinds, so sync reads straight past it.
 */
export const META_KIND = 'meta';
export const SCHEMA_ID = 'schema';

/** The devices that have connected to this project, one row each under the same `meta` kind:
 * `device:<id>`. Kept in the cloud rather than on each device for the obvious reason — the point is
 * for the phone to be able to say what the laptop did. */
export const DEVICE_PREFIX = 'device:';

const sql1 = `-- GuestSeat · sync (migration 1)

create table if not exists public.${TABLE} (
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  kind        text        not null,
  record_id   text        not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false,
  data        jsonb,
  -- Which device wrote the row. The same account is signed in everywhere, so without these
  -- "which of my devices overwrote my seating plan?" has no answer.
  device_id   text,
  device_name text,
  primary key (user_id, kind, record_id)
);

-- Without this, every user of the project would see everyone else's rows.
alter table public.${TABLE} enable row level security;

drop policy if exists "only my rows" on public.${TABLE};
create policy "only my rows" on public.${TABLE}
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The server's clock, not the phone's: without this, two devices with unequal clocks would be
-- compared in different units and a device running behind would lose changes it should have won.
-- Whatever the device sends is ignored.
create or replace function public.${TABLE}_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ${TABLE}_touch on public.${TABLE};
create trigger ${TABLE}_touch
  before insert or update on public.${TABLE}
  for each row execute function public.${TABLE}_touch();

-- If the project does not expose new tables to the Data API automatically ("Automatically expose
-- new tables" turned off), the table would exist but the API would refuse it. Only the signed-in
-- user is granted anything; which rows they see is still decided by the policy above.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.${TABLE} to authenticated;

-- A sync pulls only what changed since last time.
create index if not exists ${TABLE}_updated_at_idx
  on public.${TABLE} (user_id, updated_at);`;

export interface Migration {
  version: number;
  /** What this does, in words — "run migration 4" means nothing to anybody. */
  name: string;
  sql: string;
  /** A PostgREST query that only succeeds once this migration has run. The script is executed
   * outside the app, in a SQL editor in another tab, so "did it work?" has no answer to come back
   * with — the honest one is asked of the database itself. */
  verify?: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'Data table, security rule, server clock, device trail and index',
    sql: sql1,
    verify: `${TABLE}?select=device_id&limit=1`,
  },
];

/** The newest migration this release carries. A project on this number is up to date. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * The version a project that has the table but has never recorded one is taken to be at.
 *
 * There is no such project today — the marker has been written since the first release that could
 * create the table. It exists for the release that adds migration 2: from then on, "the table is
 * there, the marker is not" can only honestly mean migration 1.
 */
export const VERSION_BEFORE_COUNTING = 1;

/** The migrations a project at `from` still has to run. */
export function pendingMigrations(from = 0): Migration[] {
  const at = Number.isFinite(from) ? from : 0;
  return MIGRATIONS.filter((m) => m.version > at);
}

/** Those migrations as one script, ready to run in one go — empty when there is nothing to do. */
export function sqlForMigration(from = 0): string {
  return pendingMigrations(from)
    .map((m) => m.sql)
    .join('\n\n');
}

/** The whole thing, for somebody setting a project up from scratch. */
export const SQL_INSTALL = `${sqlForMigration(0)}
-- Run it in Supabase → SQL Editor → New query → Run. Running it twice changes nothing.`;
