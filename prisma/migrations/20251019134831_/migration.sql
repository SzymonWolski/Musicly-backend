-- AlterTable
ALTER TABLE "Playlista" ADD COLUMN     "allowFriendsAccess" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlaylistaDostep" (
    "ID_dostep" SERIAL NOT NULL,
    "ID_playlisty" INTEGER NOT NULL,
    "ID_uzytkownik" INTEGER NOT NULL,
    "data_dodania" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistaDostep_pkey" PRIMARY KEY ("ID_dostep")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistaDostep_ID_playlisty_ID_uzytkownik_key" ON "PlaylistaDostep"("ID_playlisty", "ID_uzytkownik");

-- AddForeignKey
ALTER TABLE "PlaylistaDostep" ADD CONSTRAINT "PlaylistaDostep_ID_playlisty_fkey" FOREIGN KEY ("ID_playlisty") REFERENCES "Playlista"("ID_playlisty") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistaDostep" ADD CONSTRAINT "PlaylistaDostep_ID_uzytkownik_fkey" FOREIGN KEY ("ID_uzytkownik") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;
