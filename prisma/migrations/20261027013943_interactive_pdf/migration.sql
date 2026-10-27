-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'Geral',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfDocument" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfWork" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "annotations" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfRevision" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "annotations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfFeedback" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "grade" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lesson_classId_published_idx" ON "Lesson"("classId", "published");

-- CreateIndex
CREATE INDEX "PdfDocument_lessonId_idx" ON "PdfDocument"("lessonId");

-- CreateIndex
CREATE INDEX "PdfWork_studentId_idx" ON "PdfWork"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PdfWork_documentId_studentId_key" ON "PdfWork"("documentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PdfRevision_workId_version_key" ON "PdfRevision"("workId", "version");

-- CreateIndex
CREATE INDEX "PdfFeedback_workId_createdAt_idx" ON "PdfFeedback"("workId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDocument" ADD CONSTRAINT "PdfDocument_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfWork" ADD CONSTRAINT "PdfWork_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PdfDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfWork" ADD CONSTRAINT "PdfWork_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfRevision" ADD CONSTRAINT "PdfRevision_workId_fkey" FOREIGN KEY ("workId") REFERENCES "PdfWork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfFeedback" ADD CONSTRAINT "PdfFeedback_workId_fkey" FOREIGN KEY ("workId") REFERENCES "PdfWork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
