-- Slice 17: durable link from an accepted DirectShare to the recipient-owned
-- copy it produced (schema.prisma's own doc comment on `DirectShare` has the
-- full rationale — mirrors ShareLinkAcceptance.createdDishId's corrected
-- nullable/SetNull shape from Slice 16 directly, without a parallel table).

-- AlterTable
ALTER TABLE "DirectShare" ADD COLUMN     "createdDishId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DirectShare_createdDishId_key" ON "DirectShare"("createdDishId");

-- AddForeignKey
ALTER TABLE "DirectShare" ADD CONSTRAINT "DirectShare_createdDishId_fkey" FOREIGN KEY ("createdDishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
