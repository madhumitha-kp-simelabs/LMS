-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_allotments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allottedBy" TEXT NOT NULL,
    "allottedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "project_allotments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_courseId_idx" ON "projects"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_courseId_position_key" ON "projects"("courseId", "position");

-- CreateIndex
CREATE INDEX "project_allotments_userId_idx" ON "project_allotments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_allotments_projectId_userId_key" ON "project_allotments"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allotments" ADD CONSTRAINT "project_allotments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allotments" ADD CONSTRAINT "project_allotments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allotments" ADD CONSTRAINT "project_allotments_allottedBy_fkey" FOREIGN KEY ("allottedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
