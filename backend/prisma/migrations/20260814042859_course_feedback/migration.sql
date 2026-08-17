-- CreateTable
CREATE TABLE "course_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_feedback_courseId_idx" ON "course_feedback"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_feedback_userId_courseId_key" ON "course_feedback"("userId", "courseId");

-- AddForeignKey
ALTER TABLE "course_feedback" ADD CONSTRAINT "course_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_feedback" ADD CONSTRAINT "course_feedback_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
