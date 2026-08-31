-- CreateEnum
CREATE TYPE "DiscontinueStatus" AS ENUM ('requested', 'approved', 'declined');

-- AlterTable
-- A third way an enrolment ends, beside finishing and moving to a later edition.
ALTER TABLE "enrollments" ADD COLUMN     "discontinuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "discontinuation_requests" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DiscontinueStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "response" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discontinuation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discontinuation_requests_courseId_status_idx" ON "discontinuation_requests"("courseId", "status");

-- CreateIndex
CREATE INDEX "discontinuation_requests_userId_idx" ON "discontinuation_requests"("userId");

-- AddForeignKey
ALTER TABLE "discontinuation_requests" ADD CONSTRAINT "discontinuation_requests_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discontinuation_requests" ADD CONSTRAINT "discontinuation_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discontinuation_requests" ADD CONSTRAINT "discontinuation_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
