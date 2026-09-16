-- CreateTable
CREATE TABLE "SyncMutationReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncMutationReceipt_userId_createdAt_idx" ON "SyncMutationReceipt"("userId", "createdAt");
