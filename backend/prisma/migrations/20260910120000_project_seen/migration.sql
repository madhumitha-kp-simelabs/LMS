-- Whether the candidate has seen a project handed to them.
--
-- Backfilled to now for everything that already exists: those were allotted
-- before there was any way to notice, and lighting up a badge for work
-- somebody has been looking at for weeks would be a false alarm on first run.
ALTER TABLE "project_allotments" ADD COLUMN     "seenAt" TIMESTAMP(3);
UPDATE "project_allotments" SET "seenAt" = NOW();
