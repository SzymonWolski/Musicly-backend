import { PrismaClient } from '@prisma/client';
import { fakerPL as faker } from "@faker-js/faker";

// Załaduj zmienne środowiskowe

const isDevelopment = process.env.DEVELOPMENT;

const prisma = new PrismaClient();

// Funkcja do tworzenia użytkownika
async function createUser(email: string, imie: string, nick: string) {
    try {
        return await prisma.uzytkownik.create({
            data: {
                email,
                imie,
                nick
            }
        });
    } catch (error) {
        console.error(`Błąd podczas tworzenia użytkownika ${nick}:`, error);
        throw error;
    }
}

// Funkcja do tworzenia autora
async function createAutor(imie: string, nazwisko: string, kryptonim_artystyczny: string) {
    try {
        return await prisma.autorzy.create({
            data: {
                imie,
                nazwisko,
                kryptonim_artystyczny
            }
        });
    } catch (error) {
        console.error(`Błąd podczas tworzenia autora ${kryptonim_artystyczny}:`, error);
        throw error;
    }
}

// Funkcja do tworzenia utworu
async function createUtwor(nazwa_utworu: string, czas_trwania: number, data_wydania: string, autorId: number) {
    try {
        return await prisma.utwor.create({
            data: {
                nazwa_utworu,
                czas_trwania,
                data_wydania,
                ID_autora: autorId,
                Numeracja: {
                    create: {
                        nr_kolejnosci: faker.number.int({ min: 1, max: 20 })
                    }
                }
            }
        });
    } catch (error) {
        console.error(`Błąd podczas tworzenia utworu ${nazwa_utworu}:`, error);
        throw error;
    }
}

// Funkcja do tworzenia albumu
async function createAlbum(nazwa_albumu: string, autorId: number, nr_kolejnosci: number) {
    try {
        return await prisma.album.create({
            data: {
                nazwa_albumu,
                ID_autora: autorId,
                nr_kolejnosci
            }
        });
    } catch (error) {
        console.error(`Błąd podczas tworzenia albumu ${nazwa_albumu}:`, error);
        throw error;
    }
}

// Funkcja do tworzenia playlisty
async function createPlaylista(nazwa_playlisty: string, userId: number) {
    try {
        return await prisma.playlista.create({
            data: {
                nazwa_playlisty,
                ID_uzytkownik: userId
            }
        });
    } catch (error) {
        console.error(`Błąd podczas tworzenia playlisty ${nazwa_playlisty}:`, error);
        throw error;
    }
}

async function main() {
    console.log('Rozpoczęto seedowanie bazy danych muzycznej...');
    const createdUsers: any[] = [];
    const createdAutors: any[] = [];
    const createdUtworys: any[] = [];
    const createdAlbums: any[] = [];
    const createdPlaylists: any[] = [];

    // Tworzenie użytkowników
    console.log('Tworzenie użytkowników...');
    try {
        // Stali użytkownicy
        const users = [
            { email: 'jan@example.com', imie: 'Jan', nick: 'janko' },
            { email: 'anna@example.com', imie: 'Anna', nick: 'anka' }
        ];

        // Dodaj losowych użytkowników w trybie developerskim
        if (isDevelopment) {
            const randomUsers = faker.helpers.multiple(() => {
                return {
                    email: faker.internet.email(),
                    imie: faker.person.firstName(),
                    nick: faker.internet.userName()
                }
            }, { count: 5 });
            users.push(...randomUsers);
        }

        // Tworzenie użytkowników
        for (const userData of users) {
            const user = await createUser(userData.email, userData.imie, userData.nick);
            createdUsers.push(user);
            console.log(`Użytkownik ${user.nick} utworzony pomyślnie`);
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia użytkowników:', error);
    }

    // Tworzenie autorów
    console.log('Tworzenie autorów...');
    try {
        const authors = [
            { imie: 'Jan', nazwisko: 'Kowalski', kryptonim: 'JK Music' },
            { imie: 'Maria', nazwisko: 'Nowak', kryptonim: 'MN Beats' }
        ];

        // Dodaj losowych autorów w trybie developerskim
        if (isDevelopment) {
            const randomAuthors = faker.helpers.multiple(() => {
                return {
                    imie: faker.person.firstName(),
                    nazwisko: faker.person.lastName(),
                    kryptonim: `${faker.music.genre()} ${faker.word.adjective()}`
                }
            }, { count: 5 });
            authors.push(...randomAuthors);
        }

        // Tworzenie autorów
        for (const authorData of authors) {
            const autor = await createAutor(authorData.imie, authorData.nazwisko, authorData.kryptonim);
            createdAutors.push(autor);
            console.log(`Autor ${autor.kryptonim_artystyczny} utworzony pomyślnie`);
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia autorów:', error);
    }

    // Tworzenie albumów
    console.log('Tworzenie albumów...');
    try {
        for (const autor of createdAutors) {
            const albumsCount = faker.number.int({ min: 1, max: 3 });
            
            for (let i = 0; i < albumsCount; i++) {
                const album = await createAlbum(
                    faker.music.songName() + " Album",
                    autor.ID_autora,
                    i + 1
                );
                createdAlbums.push(album);
                console.log(`Album "${album.nazwa_albumu}" utworzony dla ${autor.kryptonim_artystyczny}`);
            }
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia albumów:', error);
    }

    // Tworzenie utworów
    console.log('Tworzenie utworów...');
    try {
        for (const autor of createdAutors) {
            const tracksCount = faker.number.int({ min: 3, max: 10 });
            
            for (let i = 0; i < tracksCount; i++) {
                const utwor = await createUtwor(
                    faker.music.songName(),
                    faker.number.int({ min: 120, max: 300 }), // czas trwania w sekundach
                    faker.date.past().toISOString().split('T')[0], // data w formacie YYYY-MM-DD
                    autor.ID_autora
                );
                createdUtworys.push(utwor);
                console.log(`Utwór "${utwor.nazwa_utworu}" utworzony dla ${autor.kryptonim_artystyczny}`);
            }
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia utworów:', error);
    }

    // Tworzenie playlist
    console.log('Tworzenie playlist...');
    try {
        for (const user of createdUsers) {
            const playlistsCount = faker.number.int({ min: 1, max: 3 });
            
            for (let i = 0; i < playlistsCount; i++) {
                const playlista = await createPlaylista(
                    `${faker.music.genre()} Mix ${i+1}`,
                    user.ID_uzytkownik
                );
                createdPlaylists.push(playlista);
                console.log(`Playlista "${playlista.nazwa_playlisty}" utworzona dla ${user.nick}`);
                
                // Dodawanie utworów do playlisty
                const tracksToAdd = faker.helpers.arrayElements(createdUtworys, faker.number.int({ min: 3, max: 10 }));
                
                for (let j = 0; j < tracksToAdd.length; j++) {
                    await prisma.playlistaUtwor.create({
                        data: {
                            ID_playlisty: playlista.ID_playlisty,
                            ID_utworu: tracksToAdd[j].ID_utworu,
                            kolejnosc: j + 1
                        }
                    });
                }
                console.log(`Dodano ${tracksToAdd.length} utworów do playlisty "${playlista.nazwa_playlisty}"`);
            }
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia playlist:', error);
    }

    // Tworzenie polubień
    console.log('Tworzenie polubień...');
    try {
        for (const user of createdUsers) {
            const tracksToLike = faker.helpers.arrayElements(createdUtworys, faker.number.int({ min: 2, max: 8 }));
            
            for (const utwor of tracksToLike) {
                try {
                    await prisma.polubienia.create({
                        data: {
                            ID_piosenki: utwor.ID_utworu,
                            ID_uzytkownik: user.ID_uzytkownik,
                            data_polubienia: faker.date.recent().toISOString().split('T')[0]
                        }
                    });
                    console.log(`Użytkownik ${user.nick} polubił utwór "${utwor.nazwa_utworu}"`);
                } catch (e) {
                    console.log(`Pominięto polubienie - użytkownik ${user.nick} już lubi "${utwor.nazwa_utworu}"`);
                }
            }
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia polubień:', error);
    }

    // Tworzenie odtwarzaczy
    console.log('Tworzenie odtwarzaczy...');
    try {
        for (const user of createdUsers) {
            // Odtwarzacz dla albumu
            if (createdAlbums.length > 0) {
                const randomAlbum = faker.helpers.arrayElement(createdAlbums);
                await prisma.odtwarzacz.create({
                    data: {
                        ID_uzytkownik: user.ID_uzytkownik,
                        ID_albumu: randomAlbum.ID_albumu
                    }
                });
                console.log(`Utworzono odtwarzacz albumu "${randomAlbum.nazwa_albumu}" dla ${user.nick}`);
            }
            
            // Odtwarzacz dla playlisty
            if (createdPlaylists.length > 0) {
                const userPlaylists = createdPlaylists.filter(p => p.ID_uzytkownik === user.ID_uzytkownik);
                if (userPlaylists.length > 0) {
                    const randomPlaylist = faker.helpers.arrayElement(userPlaylists);
                    await prisma.odtwarzacz.create({
                        data: {
                            ID_uzytkownik: user.ID_uzytkownik,
                            ID_playlisty: randomPlaylist.ID_playlisty
                        }
                    });
                    console.log(`Utworzono odtwarzacz playlisty "${randomPlaylist.nazwa_playlisty}" dla ${user.nick}`);
                }
            }
            
            // Odtwarzacz dla pojedynczego utworu
            if (createdUtworys.length > 0) {
                const randomUtwor = faker.helpers.arrayElement(createdUtworys);
                await prisma.odtwarzacz.create({
                    data: {
                        ID_uzytkownik: user.ID_uzytkownik,
                        ID_utworu: randomUtwor.ID_utworu
                    }
                });
                console.log(`Utworzono odtwarzacz utworu "${randomUtwor.nazwa_utworu}" dla ${user.nick}`);
            }
        }
    } catch (error) {
        console.error('Błąd podczas tworzenia odtwarzaczy:', error);
    }

    console.log('Seedowanie bazy danych muzycznej zakończone pomyślnie');
}

main()
    .then(async () => {
        console.log('Rozłączono z bazą danych');
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error('Błąd podczas seedowania:', e);
        await prisma.$disconnect();
        process.exit(1);
    });