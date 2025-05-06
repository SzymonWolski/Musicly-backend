/*
  Warnings:

  - You are about to drop the column `imie` on the `Uzytkownik` table. All the data in the column will be lost.
  - Added the required column `haslo` to the `Uzytkownik` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Uzytkownik" DROP COLUMN "imie",
ADD COLUMN     "haslo" TEXT NOT NULL;
