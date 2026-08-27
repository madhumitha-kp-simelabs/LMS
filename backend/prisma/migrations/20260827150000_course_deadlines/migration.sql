-- CreateEnum
CREATE TYPE "ExtensionStatus" AS ENUM ('requested', 'approved', 'declined');

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedDays" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "extension_requests" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'requested',
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedDays" INTEGER,
    "response" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extension_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extension_requests_courseId_status_idx" ON "extension_requests"("courseId", "status");

-- CreateIndex
CREATE INDEX "extension_requests_userId_idx" ON "extension_requests"("userId");

-- AddForeignKey
ALTER TABLE "extension_requests" ADD CONSTRAINT "extension_requests_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_requests" ADD CONSTRAINT "extension_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_requests" ADD CONSTRAINT "extension_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Candidates already under way get the deadline they would have had: the day
-- they started plus the course's standard duration. Backfilled rather than left
-- null, so the first person to open the screen does not see a cohort with no
-- deadlines and assume the feature is broken. Courses with no duration set stay
-- null, which is a course without a deadline rather than one instantly overdue.
UPDATE "enrollments" e
SET "dueAt" = e."startedAt" + (c."durationWeeks" * INTERVAL '7 days')
FROM "courses" c
WHERE c.id = e."courseId"
  AND e."startedAt" IS NOT NULL
  AND c."durationWeeks" IS NOT NULL;
