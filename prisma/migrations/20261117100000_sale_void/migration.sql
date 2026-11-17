-- AlterTable
ALTER TABLE `Sale`
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedByName` VARCHAR(191) NULL,
    ADD COLUMN `voidReason` TEXT NULL;
