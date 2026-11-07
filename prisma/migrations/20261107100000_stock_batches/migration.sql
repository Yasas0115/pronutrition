-- CreateTable
CREATE TABLE `StockBatch` (
    `id` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `unitCost` INTEGER NOT NULL,
    `qtyReceived` INTEGER NOT NULL,
    `qtyRemaining` INTEGER NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockBatch_branchId_productId_receivedAt_idx`(`branchId`, `productId`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockBatch` ADD CONSTRAINT `StockBatch_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockBatch` ADD CONSTRAINT `StockBatch_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Opening batch: stock already on the shelf becomes one batch at the product's
-- current buying price (the best information that exists today).
INSERT INTO `StockBatch` (`id`, `branchId`, `productId`, `unitCost`, `qtyReceived`, `qtyRemaining`, `receivedAt`)
SELECT UUID(), bs.`branchId`, bs.`productId`, p.`cost`, bs.`stock`, bs.`stock`, CURRENT_TIMESTAMP(3)
FROM `BranchStock` bs
JOIN `Product` p ON p.`id` = bs.`productId`
WHERE bs.`stock` > 0;
