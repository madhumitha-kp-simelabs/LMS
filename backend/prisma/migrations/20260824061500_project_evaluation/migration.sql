-- AlterTable
ALTER TABLE "project_allotments" ADD COLUMN     "evaluatedAt" TIMESTAMP(3),
ADD COLUMN     "evaluatedBy" TEXT,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "score" INTEGER;

-- AddForeignKey
ALTER TABLE "project_allotments" ADD CONSTRAINT "project_allotments_evaluatedBy_fkey" FOREIGN KEY ("evaluatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
