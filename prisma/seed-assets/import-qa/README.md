# Import QA fixtures

`failed-import-fixture.rga` is a deterministic, synthetic Recipe Gallery
export (two records) for manually exercising the batch importer's "Failed
to import" results experience — see Import QA polish pass §13.

Generate it (regenerable any time, not committed pre-built — see
`scripts/generate-import-qa-fixture.ts`'s own doc comment for why):

```
pnpm qa:generate-import-fixture
```

Then, signed in to a dev/local account:

1. Go to `/recipes/import` → Upload file → select `failed-import-fixture.rga`.
2. Both rows land in "Ready to import" (neither needs review).
3. Select all, click Import.
4. Results: "QA Fixture — Imports Successfully" lands under Successfully
   imported; "QA Fixture — Fails To Import" lands under Failed to import,
   with a real (not simulated) persistence error — its body is a bare
   heading line with no ingredients/instructions, which passes parsing and
   the client-side preflight check but is rejected server-side by
   `hasMinimumContent` (`src/lib/dishes/schema.ts`).
5. "Retry failed imports" will fail again every time, unmodified — fix the
   draft first (open Review, add any ingredient/instruction) to see a
   retry succeed instead.

Deletes nothing and mutates no existing account data — it only creates the
one "Imports Successfully" Dish (and, if you fix and retry it, the other
one too) under whatever account runs it.
