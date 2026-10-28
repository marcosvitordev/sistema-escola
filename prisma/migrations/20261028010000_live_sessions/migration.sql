CREATE TABLE "LiveSession" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "roomName" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiveSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LiveSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LiveSession_roomName_key" ON "LiveSession"("roomName");
CREATE INDEX "LiveSession_classId_endedAt_idx" ON "LiveSession"("classId", "endedAt");
CREATE INDEX "LiveSession_hostId_idx" ON "LiveSession"("hostId");
CREATE UNIQUE INDEX "LiveSession_one_active_per_class" ON "LiveSession"("classId") WHERE "endedAt" IS NULL;
