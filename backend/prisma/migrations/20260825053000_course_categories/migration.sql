-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "courses_categoryId_idx" ON "courses"("categoryId");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A starting set, so the first person to open the catalogue finds a working
-- grouping rather than an empty concept they have to invent from scratch.
-- Administrators add, rename and remove these from the catalogue screen.
INSERT INTO "categories" ("id", "name", "slug", "position", "updatedAt") VALUES
    (gen_random_uuid(), 'Frontend',           'frontend',           1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Backend',            'backend',            2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'UI/UX Design',       'ui-ux-design',       3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Project Management', 'project-management', 4, CURRENT_TIMESTAMP);
