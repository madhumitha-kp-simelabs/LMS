-- Who uploaded each piece of material.
--
-- Nullable: files that predate this column have no answer, and inventing one
-- would be worse than showing none. SetNull on delete so the record of the file
-- outlives the account of whoever uploaded it.
ALTER TABLE "materials" ADD COLUMN     "uploadedById" TEXT;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
