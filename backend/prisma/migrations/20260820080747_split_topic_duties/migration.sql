-- A topic's single duty becomes two: one trainer writes the material, another
-- sets the quiz.
--
-- Written by hand rather than as generated: Prisma's version dropped the old
-- column before anything read it, which would have thrown away every duty
-- already handed out.

-- 1. The two halves.
ALTER TABLE "topics"
  ADD COLUMN "materialTrainerId" TEXT,
  ADD COLUMN "quizTrainerId"     TEXT;

-- 2. Whoever held the topic held both jobs, so carry them into both columns.
UPDATE "topics"
SET "materialTrainerId" = "assignedTrainerId",
    "quizTrainerId"     = "assignedTrainerId"
WHERE "assignedTrainerId" IS NOT NULL;

-- 3. Retire the old column.
ALTER TABLE "topics" DROP CONSTRAINT "topics_assignedTrainerId_fkey";
DROP INDEX "topics_assignedTrainerId_idx";
ALTER TABLE "topics" DROP COLUMN "assignedTrainerId";

-- 4. Index and constrain the new ones.
CREATE INDEX "topics_materialTrainerId_idx" ON "topics"("materialTrainerId");
CREATE INDEX "topics_quizTrainerId_idx" ON "topics"("quizTrainerId");

ALTER TABLE "topics" ADD CONSTRAINT "topics_materialTrainerId_fkey"
  FOREIGN KEY ("materialTrainerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_quizTrainerId_fkey"
  FOREIGN KEY ("quizTrainerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
