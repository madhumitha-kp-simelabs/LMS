-- The lead's closing word on a candidate, in prose rather than as a score.
ALTER TABLE "enrollments" ADD COLUMN     "evaluation" TEXT;
ALTER TABLE "enrollments" ADD COLUMN     "evaluatedById" TEXT;
ALTER TABLE "enrollments" ADD COLUMN     "evaluatedAt" TIMESTAMP(3);

-- SetNull: a lead leaving must not delete the evaluations they wrote.
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
