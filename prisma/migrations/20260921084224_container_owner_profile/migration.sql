-- AlterTable
ALTER TABLE `container` ADD COLUMN `ownerEmail` VARCHAR(191) NULL,
    ADD COLUMN `ownerMode` VARCHAR(191) NOT NULL DEFAULT 'same',
    ADD COLUMN `ownerName` VARCHAR(191) NULL,
    ADD COLUMN `ownerPasswordHash` VARCHAR(191) NULL,
    ADD COLUMN `ownerUsername` VARCHAR(191) NULL;
