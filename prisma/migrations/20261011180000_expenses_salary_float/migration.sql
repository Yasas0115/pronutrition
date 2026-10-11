-- AlterTable
ALTER TABLE `Branch` ADD COLUMN `floatAmount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ExpenseCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Worker` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `monthlySalary` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Worker_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalaryPayment` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NULL,
    `workerName` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `baseAmount` INTEGER NOT NULL,
    `bonus` INTEGER NOT NULL DEFAULT 0,
    `deduction` INTEGER NOT NULL DEFAULT 0,
    `netPaid` INTEGER NOT NULL,
    `paidVia` VARCHAR(191) NOT NULL DEFAULT 'CASH',
    `paidAt` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `branchId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidedAt` DATETIME(3) NULL,
    `voidedByName` VARCHAR(191) NULL,
    `voidReason` TEXT NULL,

    INDEX `SalaryPayment_workerId_period_idx`(`workerId`, `period`),
    INDEX `SalaryPayment_period_idx`(`period`),
    INDEX `SalaryPayment_paidAt_idx`(`paidAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `branchName` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'GENERAL',
    `category` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `description` TEXT NULL,
    `paidVia` VARCHAR(191) NOT NULL DEFAULT 'CASH',
    `expenseDate` DATETIME(3) NOT NULL,
    `workerId` VARCHAR(191) NULL,
    `workerName` VARCHAR(191) NULL,
    `salaryPaymentId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidedAt` DATETIME(3) NULL,
    `voidedByName` VARCHAR(191) NULL,
    `voidReason` TEXT NULL,

    UNIQUE INDEX `Expense_salaryPaymentId_key`(`salaryPaymentId`),
    INDEX `Expense_expenseDate_idx`(`expenseDate`),
    INDEX `Expense_kind_expenseDate_idx`(`kind`, `expenseDate`),
    INDEX `Expense_branchId_expenseDate_idx`(`branchId`, `expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FloatAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `branchName` VARCHAR(191) NOT NULL,
    `oldAmount` INTEGER NOT NULL,
    `newAmount` INTEGER NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FloatAdjustment_branchId_createdAt_idx`(`branchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_salaryPaymentId_fkey` FOREIGN KEY (`salaryPaymentId`) REFERENCES `SalaryPayment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FloatAdjustment` ADD CONSTRAINT `FloatAdjustment_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data: a starter set of expense categories. The owner can add / delete their
-- own from the Profit & Expenses page. (name is UNIQUE, so INSERT IGNORE makes
-- this safe to re-run and never overwrites anything.)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `ExpenseCategory` (`id`, `name`, `sortOrder`, `createdAt`, `updatedAt`) VALUES
    (UUID(), 'Rent', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Electricity', 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Water', 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Internet & phone', 4, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Transport', 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Packaging & supplies', 6, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Repairs & maintenance', 7, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Marketing', 8, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Bank charges', 9, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Other', 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
