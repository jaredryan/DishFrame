-- DropForeignKey
ALTER TABLE "ShareLinkAcceptance" DROP CONSTRAINT "ShareLinkAcceptance_createdDishId_fkey";

-- AlterTable
ALTER TABLE "ShareLinkAcceptance" ALTER COLUMN "createdDishId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ShareLinkAcceptance" ADD CONSTRAINT "ShareLinkAcceptance_createdDishId_fkey" FOREIGN KEY ("createdDishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
