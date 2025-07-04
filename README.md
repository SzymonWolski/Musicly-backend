# Table
- [Table](#table)
- [Back](#back)
  - [O projekcie](#o-projekcie)
  - [Wymagania wstępne](#wymagania-wstępne)
  - [Instalacja zależności](#instalacja-zależności)
  - [Konfiguracja](#konfiguracja)
  - [Uruchamianie aplikacji](#uruchamianie-aplikacji)
    - [Migracja bazy danych](#migracja-bazy-danych)
    - [Uruchamianie w trybie deweloperskim](#uruchamianie-w-trybie-deweloperskim)
    - [Uruchamianie w Dockerze (tryb produkcyjny)](#uruchamianie-w-dockerze-tryb-produkcyjny)
    - [Uruchamianie z Docker Compose](#uruchamianie-z-docker-compose)
  - [Streaming i transkodowanie](#streaming-i-transkodowanie)
  - [Testowanie](#testowanie)
  - [Struktura projektu](#struktura-projektu)

# Back

## O projekcie

Buddy-Share to backend aplikacji służącej do udostępniania i streamingu plików wideo. Aplikacja została zbudowana w oparciu o Bun i umożliwia szybkie wdrażanie zarówno w środowisku deweloperskim, jak i produkcyjnym przy użyciu Dockera.

## Wymagania wstępne

- Zainstalowany [Bun](https://bun.sh)
- Zainstalowany [Docker](https://www.docker.com/)
- Zainstalowany [Docker Compose](https://docs.docker.com/compose/install/) (opcjonalnie)

## Instalacja zależności

Aby zainstalować wszystkie wymagane zależności, uruchom poniższe polecenie w katalogu głównym projektu:

```bash
bun install
bun add bcrypt jsonwebtoken express-validator @types/express-validator @types/bcrypt @types/jsonwebtoken multer @types/multer uuid @types/uuid music-metadata
```

## Konfiguracja

Aplikacja korzysta z następujących zmiennych środowiskowych, które można skonfigurować w pliku `.env`:

```
SALT=jakis_sekret              # Sól używana do haszowania haseł użytkowników
PEPPER=jakis_sekret            # Dodatkowe zabezpieczenie przy haszowaniu haseł
TESTING_PASS=jakis_sekret      # Hasło używane do celów testowych

FRONT_PORT=3000                # Port na którym działa frontend aplikacji
FRONT_HOST=localhost           # Host na którym działa frontend aplikacji
PORT=5000                      # Port na którym działa backend aplikacji

JWT_ACCESS_SECRET=jakis_sekret # Klucz do dostępowych JWT
JWT_REFRESH_SECRET=jakis_sekret # Klucz do odświeżających JWT
COOKIE_SECRET=jakis_sekret     # Klucz do szyfrowania plików cookie
DATABASE_URL="string do podłączenia z bazą danych"

# Konfiguracja bazy danych PostgreSQL dla Docker Compose
POSTGRES_USER=nazwa_uzytkownika
POSTGRES_PASSWORD=haslo_uzytkownika
POSTGRES_DB=nazwa_bazy_danych
```


## Uruchamianie aplikacji

### Migracja bazy danych 

```bash
bunx prisma db push
```

### Uruchamianie w trybie deweloperskim

Aby uruchomić aplikację w trybie deweloperskim, użyj poniższego polecenia:

```bash
bun run index.ts
```

### Uruchamianie w Dockerze (tryb produkcyjny)

Aby uruchomić aplikację w kontenerze Docker w trybie produkcyjnym, wykonaj poniższe kroki:

1. Zbuduj obraz Docker:

    ```bash
    docker build -t musicly-backend:latest .
    ```

2. Uruchom kontener Docker:

    ```bash
    docker run -v PATH_1:/videos -p PORT:3000 --env-file .env musicly-backend:latest
    ```

gdzie:
 - PATH_1 - ścieżka lokalna na komputerze zawierająca film z nazwą `video.mp4`. Upewnij się, że ścieżka jest poprawna i dostępna dla kontenera Docker.
 - PORT - port, na którym ma działać aplikacja, aby można było uzyskać do niej dostęp z poziomu np. przeglądarki na komputerze lokalnym. Upewnij się, że port nie jest zajęty przez inne aplikacje.

### Uruchamianie z Docker Compose

Projekt zawiera konfigurację Docker Compose, która pozwala na łatwe uruchomienie całego środowiska aplikacji, w tym:
- Backend Buddy-Share
- Bazę danych PostgreSQL
- Serwer Nginx do obsługi streamingu RTMP, HLS i DASH

Aby uruchomić całe środowisko za pomocą Docker Compose:

1. Upewnij się, że masz poprawnie skonfigurowany plik `.env` z wszystkimi wymaganymi zmiennymi środowiskowymi.

2. Zbuduj obraz Nginx RTMP:
   ```bash
   cd nginx
   docker build -t nginx-rtmp .
   cd ..
   ```

3. Zbuduj obraz backend aplikacji:
   ```bash
   docker build -t musicly-backend:latest .
   ```

4. Uruchom kontenery za pomocą Docker Compose:
   ```bash
   docker-compose up
   ```
5. Skrót do uruchomienia w trakcie rozwoju:
   ```bash
   docker build -t musicly-backend:latest . && docker compose up -d && docker exec -it backend bunx prisma db seed
   ```

Po uruchomieniu, usługi będą dostępne pod następującymi adresami:
- Backend API: http://localhost:5000
- Serwer RTMP: rtmp://localhost:1935/live
- Streaming HLS: http://localhost:80/hls/
- Streaming DASH: http://localhost:80/dash/
- Panel statystyk RTMP: http://localhost:8080/api/streams

## Streaming i transkodowanie

Aplikacja obsługuje streaming wideo przez RTMP z automatycznym transkodowaniem do formatów HLS i DASH. Konfiguracja Nginx RTMP zapewnia:

- Odbiór strumieni RTMP na porcie 1935
- Konwersję strumieni do formatu HLS dostępnego pod `/hls/`
- Konwersję strumieni do formatu DASH dostępnego pod `/dash/`
- Automatyczne transkodowanie do różnych rozdzielczości (360p, 480p, 720p)
- Powiadomienia do backendu o rozpoczęciu i zakończeniu streamingu

Aby rozpocząć streaming:
1. Użyj oprogramowania do streamingu (np. OBS Studio)
2. Skonfiguruj URL RTMP: `rtmp://localhost:1935/live`
3. Ustaw klucz streamu zgodny z ID z aplikacji

## Testowanie

Aby uruchomić testy, użyj następującego polecenia:

```bash
bun test
```

Dla testów z pokryciem kodu:

```bash
bun test --coverage
```

## Struktura projektu

```
.
├── src/                # Główny kod źródłowy aplikacji
│   ├── controllers/    # Kontrolery obsługujące żądania HTTP
│   ├── middleware/     # Middleware aplikacji
│   ├── docs/           # Konfiguracja swagger
│   ├── routes/         # Definicje tras API
│   └── utils/          # Narzędzia pomocnicze
├── nginx/              # Konfiguracja Nginx RTMP do streamingu
│   ├── Dockerfile      # Dockerfile dla serwera Nginx RTMP
│   └── nginx.conf      # Konfiguracja Nginx z modułem RTMP
├── tests/              # Testy aplikacji
├── compose.yml         # Konfiguracja Docker Compose
├── Dockerfile          # Konfiguracja budowania obrazu Docker backend
├── package.json        # Konfiguracja projektu i zależności
├── tsconfig.json       # Konfiguracja TypeScript
└── README.md           # Dokumentacja projektu
```

Dodanie trigerów dokumentowania zmian w utworach.

```bash
-- 1. Tworzymy funkcję triggerową
CREATE OR REPLACE FUNCTION log_utwor_operations()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO "UtworyLog" (nazwa_utworu, akcja)
        VALUES (OLD.nazwa_utworu, 'usunieto');
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO "UtworyLog" (nazwa_utworu, akcja)
        VALUES (NEW.nazwa_utworu, 'dodano');
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Tworzymy triggery dla tabeli z utworami
--    Jeśli Twoja tabela ma inną nazwę, zmień 'Utwory' na właściwą nazwę

-- Trigger dla INSERT
CREATE OR REPLACE TRIGGER utwor_added
AFTER INSERT ON "Utwor"
FOR EACH ROW
EXECUTE FUNCTION log_utwor_operations();

-- Trigger dla DELETE
CREATE OR REPLACE TRIGGER utwor_deleted
AFTER DELETE ON "Utwor"
FOR EACH ROW
EXECUTE FUNCTION log_utwor_operations();
```

Procedura zapraszania użytkowników do przyjaciół.


Wysyłanie zaproszeń:
```bash
CREATE OR REPLACE PROCEDURE friend_req(
    sender_id INT, 
    recipient_id INT, 
    OUT status_code INT, 
    OUT message TEXT,
    OUT friendship_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    existing_friendship RECORD;
BEGIN
    -- Initialize outputs
    status_code := 200;
    message := '';
    friendship_id := NULL;
    
    -- Validate input
    IF recipient_id IS NULL THEN
        status_code := 400;
        message := 'ID odbiorcy jest wymagane';
        RETURN;
    END IF;
    
    IF recipient_id = sender_id THEN
        status_code := 400;
        message := 'Nie możesz wysłać zaproszenia do samego siebie';
        RETURN;
    END IF;
    
    -- Check if recipient exists
    IF NOT EXISTS (
        SELECT 1 FROM "Uzytkownik"
        WHERE "ID_uzytkownik" = recipient_id
    ) THEN
        status_code := 404;
        message := 'Użytkownik nie istnieje';
        RETURN;
    END IF;
    
    -- Check if friendship already exists
    SELECT * INTO existing_friendship 
    FROM "Znajomi"
    WHERE ("ID_uzytkownik1" = sender_id AND "ID_uzytkownik2" = recipient_id)
    OR ("ID_uzytkownik1" = recipient_id AND "ID_uzytkownik2" = sender_id);
    
    IF FOUND THEN
        IF existing_friendship.status = 'accepted' THEN
            status_code := 400;
            message := 'Jesteście już znajomymi';
            RETURN;
        ELSIF existing_friendship.status = 'pending' THEN
            IF existing_friendship."ID_uzytkownik1" = sender_id THEN
                status_code := 400;
                message := 'Wysłałeś już zaproszenie do tego użytkownika';
                RETURN;
            ELSE
                status_code := 400;
                message := 'Ten użytkownik już wysłał Ci zaproszenie. Sprawdź otrzymane zaproszenia.';
                friendship_id := existing_friendship."ID_znajomych";
                RETURN;
            END IF;
        END IF;
    END IF;
    
    -- Create a new friend request
    INSERT INTO "Znajomi" ("ID_uzytkownik1", "ID_uzytkownik2", status)
    VALUES (sender_id, recipient_id, 'pending')
    RETURNING "ID_znajomych" INTO friendship_id;
    
    status_code := 201;
    message := 'Zaproszenie zostało wysłane';
END;
$$;
```

Funkcja licząca liczbę polubień indywidualnych piosenek:
```bash
CREATE OR REPLACE FUNCTION liczba_polubien(id_utworu INT) 
RETURNS INT AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM "Polubienia" WHERE "ID_piosenki" = id_utworu);
END;
$$ LANGUAGE plpgsql;
```