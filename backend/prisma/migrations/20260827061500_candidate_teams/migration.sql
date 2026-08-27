-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE INDEX "users_teamId_idx" ON "users"("teamId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A starting set, so the first administrator to open the page finds a working
-- grouping rather than an empty concept to invent from scratch. Added to,
-- renamed and removed from the Administration screen.
INSERT INTO "teams" ("id", "name", "slug", "position", "updatedAt") VALUES
    (gen_random_uuid(), 'MERN',               'mern',               1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Python',             'python',             2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Project Management', 'project-management', 3, CURRENT_TIMESTAMP);
