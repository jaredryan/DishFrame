-- Code-audit fix (2026-08-27, second follow-up): `deleteImageAssetIfOrphaned`
-- (src/lib/images/service.ts) runs `frozenImageAssetIds: { has: imageAssetId }`
-- against `DirectShare` on every candidate orphan image, to check whether a
-- still-PENDING delivery's frozen graph still needs it (Slice 17 correction
-- pass) before actually deleting the `ImageAsset` row/Blob. That's a
-- PostgreSQL array-containment query with no supporting index, forcing a
-- full-table scan of `DirectShare` every time. A GIN index on the array
-- column is Postgres's standard way to accelerate this containment check.
--
-- Partial (`WHERE status = 'PENDING'`), matching the query's own
-- `status: "PENDING"` filter exactly: only a still-pending delivery's frozen
-- graph is ever consulted here (Accepted/Declined/Canceled rows are
-- irrelevant to this check — see the doc comment on
-- `deleteImageAssetIfOrphaned`), so the index only needs to cover that
-- subset. This also keeps the index small as rows age out of PENDING over
-- time, rather than indexing every DirectShare row ever created.
--
-- Prisma Schema Language has no representation for a GIN index (no
-- `previewFeatures` for it here), so this is hand-authored raw SQL, like
-- every other GIN/trigram index in this schema (see AGENTS.md's "Database
-- migrations" section and the `dish_*_trgm_idx` indexes) — not something a
-- future `prisma migrate dev --create-only` diff will regenerate. Protected
-- against accidental removal via `scripts/scan-migrations.ts`'s
-- PROTECTED_OBJECT_NAMES list.

CREATE INDEX "direct_share_frozen_image_asset_ids_gin_idx"
  ON "DirectShare" USING GIN ("frozenImageAssetIds")
  WHERE "status" = 'PENDING';
