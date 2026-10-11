-- AlterTable
ALTER TABLE `SaleItem` ADD COLUMN `unitCost` INTEGER NULL;

-- CreateTable
CREATE TABLE `ProductPriceHistory` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `oldPrice` INTEGER NOT NULL,
    `newPrice` INTEGER NOT NULL,
    `oldCost` INTEGER NOT NULL,
    `newCost` INTEGER NOT NULL,
    `onHandUnits` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(191) NOT NULL DEFAULT 'EDIT',
    `note` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductPriceHistory_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `ProductPriceHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `before` LONGTEXT NULL,
    `after` LONGTEXT NULL,
    `branchId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductPriceHistory` ADD CONSTRAINT `ProductPriceHistory_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
