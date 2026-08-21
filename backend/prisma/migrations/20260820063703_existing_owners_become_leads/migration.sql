-- Every course owner is a lead by definition of the new role. Anyone who owns a
-- course was a `trainer` under the old per-course model, so carry them across.
--
-- This is a separate migration from the one adding the enum value: Postgres
-- will not let a new enum value be used in the transaction that created it.
UPDATE "users"
SET "role" = 'lead'
WHERE "role" = 'trainer'
  AND "id" IN (SELECT DISTINCT "ownerId" FROM "courses" WHERE "ownerId" IS NOT NULL);
