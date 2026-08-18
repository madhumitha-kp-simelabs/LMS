-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "assignedTrainerId" TEXT;

-- CreateTable
CREATE TABLE "course_trainers" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_trainers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_trainers_userId_idx" ON "course_trainers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "course_trainers_courseId_userId_key" ON "course_trainers"("courseId", "userId");

-- CreateIndex
CREATE INDEX "topics_assignedTrainerId_idx" ON "topics"("assignedTrainerId");

-- AddForeignKey
ALTER TABLE "course_trainers" ADD CONSTRAINT "course_trainers_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_trainers" ADD CONSTRAINT "course_trainers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_assignedTrainerId_fkey" FOREIGN KEY ("assignedTrainerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
