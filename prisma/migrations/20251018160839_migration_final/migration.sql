/*
  Warnings:

  - You are about to drop the column `czas_trwania` on the `Utwor` table. All the data in the column will be lost.
  - You are about to drop the `Odtwarzacz` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_PlaylistaToUtwor` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Odtwarzacz" DROP CONSTRAINT "Odtwarzacz_ID_albumu_fkey";

-- DropForeignKey
ALTER TABLE "public"."Odtwarzacz" DROP CONSTRAINT "Odtwarzacz_ID_playlisty_fkey";

-- DropForeignKey
ALTER TABLE "public"."Odtwarzacz" DROP CONSTRAINT "Odtwarzacz_ID_utworu_fkey";

-- DropForeignKey
ALTER TABLE "public"."Odtwarzacz" DROP CONSTRAINT "Odtwarzacz_ID_uzytkownik_fkey";

-- DropForeignKey
ALTER TABLE "public"."_PlaylistaToUtwor" DROP CONSTRAINT "_PlaylistaToUtwor_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_PlaylistaToUtwor" DROP CONSTRAINT "_PlaylistaToUtwor_B_fkey";

-- AlterTable
ALTER TABLE "Playlista" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageMimetype" TEXT,
ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "imageSize" INTEGER;

-- AlterTable
ALTER TABLE "Utwor" DROP COLUMN "czas_trwania",
ADD COLUMN     "filename" TEXT,
ADD COLUMN     "filepath" TEXT,
ADD COLUMN     "filesize" INTEGER,
ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageMimetype" TEXT,
ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "imageSize" INTEGER,
ADD COLUMN     "mimetype" TEXT;

-- AlterTable
ALTER TABLE "Uzytkownik" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profileImageFilename" TEXT,
ADD COLUMN     "profileImageMimetype" TEXT,
ADD COLUMN     "profileImagePath" TEXT,
ADD COLUMN     "profileImageSize" INTEGER;

-- DropTable
DROP TABLE "public"."Odtwarzacz";

-- DropTable
DROP TABLE "public"."_PlaylistaToUtwor";

-- CreateTable
CREATE TABLE "PolubieniaPlaylist" (
    "ID_playlisty" INTEGER NOT NULL,
    "ID_uzytkownik" INTEGER NOT NULL,
    "data_polubienia" TEXT NOT NULL,

    CONSTRAINT "PolubieniaPlaylist_pkey" PRIMARY KEY ("ID_playlisty","ID_uzytkownik")
);

-- CreateTable
CREATE TABLE "Znajomi" (
    "ID_znajomych" SERIAL NOT NULL,
    "ID_uzytkownik1" INTEGER NOT NULL,
    "ID_uzytkownik2" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "data_dodania" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Znajomi_pkey" PRIMARY KEY ("ID_znajomych")
);

-- CreateTable
CREATE TABLE "Wiadomosci" (
    "ID_wiadomosci" SERIAL NOT NULL,
    "ID_nadawca" INTEGER NOT NULL,
    "ID_odbiorca" INTEGER NOT NULL,
    "tresc" TEXT NOT NULL,
    "data_wyslania" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "przeczytana" BOOLEAN NOT NULL DEFAULT false,
    "klucz_timestamp" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Wiadomosci_pkey" PRIMARY KEY ("ID_wiadomosci")
);

-- CreateTable
CREATE TABLE "UtworyLog" (
    "ID_log" SERIAL NOT NULL,
    "nazwa_utworu" TEXT,
    "akcja" TEXT NOT NULL,
    "data_akcji" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtworyLog_pkey" PRIMARY KEY ("ID_log")
);

-- CreateIndex
CREATE UNIQUE INDEX "Znajomi_ID_uzytkownik1_ID_uzytkownik2_key" ON "Znajomi"("ID_uzytkownik1", "ID_uzytkownik2");

-- AddForeignKey
ALTER TABLE "PolubieniaPlaylist" ADD CONSTRAINT "PolubieniaPlaylist_ID_uzytkownik_fkey" FOREIGN KEY ("ID_uzytkownik") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolubieniaPlaylist" ADD CONSTRAINT "PolubieniaPlaylist_ID_playlisty_fkey" FOREIGN KEY ("ID_playlisty") REFERENCES "Playlista"("ID_playlisty") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Znajomi" ADD CONSTRAINT "Znajomi_ID_uzytkownik1_fkey" FOREIGN KEY ("ID_uzytkownik1") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Znajomi" ADD CONSTRAINT "Znajomi_ID_uzytkownik2_fkey" FOREIGN KEY ("ID_uzytkownik2") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wiadomosci" ADD CONSTRAINT "Wiadomosci_ID_nadawca_fkey" FOREIGN KEY ("ID_nadawca") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wiadomosci" ADD CONSTRAINT "Wiadomosci_ID_odbiorca_fkey" FOREIGN KEY ("ID_odbiorca") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;
