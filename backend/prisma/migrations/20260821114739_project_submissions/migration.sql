-- AlterTable
ALTER TABLE "project_allotments" ADD COLUMN     "fileSizeBytes" BIGINT,
ADD COLUMN     "fileUrl" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "submissionNote" TEXT,
ADD COLUMN     "submissionUrl" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);
