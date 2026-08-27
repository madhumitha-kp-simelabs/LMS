-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('requested', 'scheduled', 'declined');

-- CreateTable
CREATE TABLE "session_requests" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "response" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_requests_courseId_status_idx" ON "session_requests"("courseId", "status");

-- CreateIndex
CREATE INDEX "session_requests_userId_idx" ON "session_requests"("userId");

-- AddForeignKey
ALTER TABLE "session_requests" ADD CONSTRAINT "session_requests_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_requests" ADD CONSTRAINT "session_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_requests" ADD CONSTRAINT "session_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
