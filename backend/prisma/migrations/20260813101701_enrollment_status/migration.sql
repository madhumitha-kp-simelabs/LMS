-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('pending', 'active');

-- DropIndex
DROP INDEX "enrollments_courseId_idx";

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "enrollments_courseId_status_idx" ON "enrollments"("courseId", "status");
