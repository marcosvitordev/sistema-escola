ALTER TABLE "Assessment" ADD COLUMN "documentId" TEXT;
CREATE INDEX "Assessment_documentId_published_idx" ON "Assessment"("documentId", "published");
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PdfDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
