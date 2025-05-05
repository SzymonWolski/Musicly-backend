-- CreateTable
CREATE TABLE "Uzytkownik" (
    "ID_uzytkownik" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "imie" TEXT NOT NULL,
    "nick" TEXT NOT NULL,

    CONSTRAINT "Uzytkownik_pkey" PRIMARY KEY ("ID_uzytkownik")
);

-- CreateTable
CREATE TABLE "Autorzy" (
    "ID_autora" SERIAL NOT NULL,
    "imie" TEXT NOT NULL,
    "kryptonim_artystyczny" TEXT NOT NULL,
    "nazwisko" TEXT NOT NULL,

    CONSTRAINT "Autorzy_pkey" PRIMARY KEY ("ID_autora")
);

-- CreateTable
CREATE TABLE "Utwor" (
    "ID_utworu" SERIAL NOT NULL,
    "czas_trwania" INTEGER NOT NULL,
    "data_wydania" TEXT NOT NULL,
    "ID_autora" INTEGER NOT NULL,
    "nazwa_utworu" TEXT NOT NULL,

    CONSTRAINT "Utwor_pkey" PRIMARY KEY ("ID_utworu")
);

-- CreateTable
CREATE TABLE "Album" (
    "ID_albumu" SERIAL NOT NULL,
    "ID_autora" INTEGER NOT NULL,
    "nazwa_albumu" TEXT NOT NULL,
    "nr_kolejnosci" INTEGER NOT NULL,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("ID_albumu")
);

-- CreateTable
CREATE TABLE "Polubienia" (
    "ID_piosenki" INTEGER NOT NULL,
    "ID_uzytkownik" INTEGER NOT NULL,
    "data_polubienia" TEXT NOT NULL,

    CONSTRAINT "Polubienia_pkey" PRIMARY KEY ("ID_piosenki","ID_uzytkownik")
);

-- CreateTable
CREATE TABLE "Odtwarzacz" (
    "ID_odtwarzacza" SERIAL NOT NULL,
    "ID_uzytkownik" INTEGER NOT NULL,
    "ID_albumu" INTEGER,
    "ID_playlisty" INTEGER,
    "ID_utworu" INTEGER,

    CONSTRAINT "Odtwarzacz_pkey" PRIMARY KEY ("ID_odtwarzacza")
);

-- CreateTable
CREATE TABLE "Numeracja_utworu" (
    "ID_utworu" INTEGER NOT NULL,
    "nr_kolejnosci" INTEGER NOT NULL,

    CONSTRAINT "Numeracja_utworu_pkey" PRIMARY KEY ("ID_utworu")
);

-- CreateTable
CREATE TABLE "Playlista" (
    "ID_playlisty" SERIAL NOT NULL,
    "ID_uzytkownik" INTEGER NOT NULL,
    "nazwa_playlisty" TEXT NOT NULL,

    CONSTRAINT "Playlista_pkey" PRIMARY KEY ("ID_playlisty")
);

-- CreateTable
CREATE TABLE "PlaylistaUtwor" (
    "ID_playlisty" INTEGER NOT NULL,
    "ID_utworu" INTEGER NOT NULL,
    "kolejnosc" INTEGER NOT NULL,

    CONSTRAINT "PlaylistaUtwor_pkey" PRIMARY KEY ("ID_playlisty","ID_utworu")
);

-- CreateTable
CREATE TABLE "_PlaylistaToUtwor" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PlaylistaToUtwor_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PlaylistaToUtwor_B_index" ON "_PlaylistaToUtwor"("B");

-- AddForeignKey
ALTER TABLE "Utwor" ADD CONSTRAINT "Utwor_ID_autora_fkey" FOREIGN KEY ("ID_autora") REFERENCES "Autorzy"("ID_autora") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_ID_autora_fkey" FOREIGN KEY ("ID_autora") REFERENCES "Autorzy"("ID_autora") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Polubienia" ADD CONSTRAINT "Polubienia_ID_uzytkownik_fkey" FOREIGN KEY ("ID_uzytkownik") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Polubienia" ADD CONSTRAINT "Polubienia_ID_piosenki_fkey" FOREIGN KEY ("ID_piosenki") REFERENCES "Utwor"("ID_utworu") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odtwarzacz" ADD CONSTRAINT "Odtwarzacz_ID_uzytkownik_fkey" FOREIGN KEY ("ID_uzytkownik") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odtwarzacz" ADD CONSTRAINT "Odtwarzacz_ID_albumu_fkey" FOREIGN KEY ("ID_albumu") REFERENCES "Album"("ID_albumu") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odtwarzacz" ADD CONSTRAINT "Odtwarzacz_ID_playlisty_fkey" FOREIGN KEY ("ID_playlisty") REFERENCES "Playlista"("ID_playlisty") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odtwarzacz" ADD CONSTRAINT "Odtwarzacz_ID_utworu_fkey" FOREIGN KEY ("ID_utworu") REFERENCES "Utwor"("ID_utworu") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Numeracja_utworu" ADD CONSTRAINT "Numeracja_utworu_ID_utworu_fkey" FOREIGN KEY ("ID_utworu") REFERENCES "Utwor"("ID_utworu") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlista" ADD CONSTRAINT "Playlista_ID_uzytkownik_fkey" FOREIGN KEY ("ID_uzytkownik") REFERENCES "Uzytkownik"("ID_uzytkownik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistaUtwor" ADD CONSTRAINT "PlaylistaUtwor_ID_playlisty_fkey" FOREIGN KEY ("ID_playlisty") REFERENCES "Playlista"("ID_playlisty") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistaUtwor" ADD CONSTRAINT "PlaylistaUtwor_ID_utworu_fkey" FOREIGN KEY ("ID_utworu") REFERENCES "Utwor"("ID_utworu") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlaylistaToUtwor" ADD CONSTRAINT "_PlaylistaToUtwor_A_fkey" FOREIGN KEY ("A") REFERENCES "Playlista"("ID_playlisty") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlaylistaToUtwor" ADD CONSTRAINT "_PlaylistaToUtwor_B_fkey" FOREIGN KEY ("B") REFERENCES "Utwor"("ID_utworu") ON DELETE CASCADE ON UPDATE CASCADE;
