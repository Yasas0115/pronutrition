-- AlterTable
ALTER TABLE `PaymentMethod` ADD COLUMN `allowsPartial` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `requiresCustomer` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Sale` ADD COLUMN `balanceDue` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `saleType` VARCHAR(191) NOT NULL DEFAULT 'RETAIL';

-- AlterTable
ALTER TABLE `SaleItem` ADD COLUMN `listPrice` INTEGER NULL;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'RETAIL',
    `notes` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdByName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_name_idx`(`name`),
    INDEX `Customer_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalePayment` (
    `id` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'SALE',
    `settlementId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalePayment_saleId_idx`(`saleId`),
    INDEX `SalePayment_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `SalePayment_createdAt_idx`(`createdAt`),
    INDEX `SalePayment_settlementId_idx`(`settlementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Sale_customerId_balanceDue_idx` ON `Sale`(`customerId`, `balanceDue`);

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalePayment` ADD CONSTRAINT `SalePayment_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalePayment` ADD CONSTRAINT `SalePayment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data: existing databases are not re-seeded, so set up the payment rules here.
-- ---------------------------------------------------------------------------

-- Koko now needs a registered customer (walk-ins: Cash / Card only).
UPDATE `PaymentMethod` SET `requiresCustomer` = true WHERE `key` = 'KOKO';

-- Add Bank transfer and Credit — only when the table already holds methods. On a
-- brand-new database it is empty and first-run registration creates the full
-- default set; inserting two rows here would make it think the set exists.
INSERT INTO `PaymentMethod`
    (`id`, `key`, `label`, `discountPercent`, `requiresCustomer`, `allowsPartial`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT UUID(), 'BANK', 'Bank transfer', 0, true, false, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `PaymentMethod`)
  AND NOT EXISTS (SELECT 1 FROM `PaymentMethod` WHERE `key` = 'BANK');

INSERT INTO `PaymentMethod`
    (`id`, `key`, `label`, `discountPercent`, `requiresCustomer`, `allowsPartial`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT UUID(), 'CREDIT', 'Credit', 0, true, true, 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `PaymentMethod`)
  AND NOT EXISTS (SELECT 1 FROM `PaymentMethod` WHERE `key` = 'CREDIT');

-- Back-fill one payment row per existing sale (all of them were paid in full at
-- the till), so collection / cash-drawer reports include history. Re-runnable.
INSERT INTO `SalePayment`
    (`id`, `saleId`, `customerId`, `branchId`, `amount`, `method`, `kind`, `userId`, `userName`, `createdAt`)
SELECT UUID(), s.`id`, NULL, s.`branchId`, s.`total`, s.`method`, 'SALE', s.`cashierId`, s.`cashierName`, s.`createdAt`
FROM `Sale` s
WHERE s.`total` > 0
  AND NOT EXISTS (SELECT 1 FROM `SalePayment` sp WHERE sp.`saleId` = s.`id`);
