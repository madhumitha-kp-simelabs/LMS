-- Courses become versioned by copy: PM-101 v2 is its own row beside v1, with
-- its own topics and its own cohort. The code therefore identifies a subject
-- rather than a course, and only the pair is unique.

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- DropIndex
DROP INDEX "courses_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_version_key" ON "courses"("code", "version");
