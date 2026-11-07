-- CreateTable
CREATE TABLE `Promotion` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `percent` INTEGER NOT NULL,
    `startsOn` VARCHAR(191) NULL,
    `endsOn` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Sale` ADD COLUMN `promoDiscount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `promoLabel` VARCHAR(191) NULL;
