-- Retiring a course without destroying it.
--
-- Nullable, so every existing course is live: archiving is something an
-- administrator does, never a state a course falls into on its own.
ALTER TABLE "courses" ADD COLUMN     "archivedAt" TIMESTAMP(3);
ALTER TABLE "courses" ADD COLUMN     "archivedById" TEXT;

-- Read constantly to keep archived courses out of every listing.
CREATE INDEX "courses_archivedAt_idx" ON "courses"("archivedAt");

-- SetNull: an administrator leaving must not take the courses they archived.
ALTER TABLE "courses" ADD CONSTRAINT "courses_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
