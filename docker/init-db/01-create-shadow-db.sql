-- Runs once, only when the postgres container's data volume is first
-- created (docker-entrypoint-initdb.d scripts never re-run against an
-- existing volume) — see docker-compose.yml. `prisma migrate dev` needs a
-- shadow database distinct from the main dev database (dishframe) to diff
-- against; this creates it up front so `pnpm db:docker:up` alone is enough.
CREATE DATABASE dishframe_shadow;
