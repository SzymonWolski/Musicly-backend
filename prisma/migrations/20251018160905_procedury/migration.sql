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

CREATE OR REPLACE TRIGGER utwor_added
AFTER INSERT ON "Utwor"
FOR EACH ROW
EXECUTE FUNCTION log_utwor_operations();

CREATE OR REPLACE TRIGGER utwor_deleted
AFTER DELETE ON "Utwor"
FOR EACH ROW
EXECUTE FUNCTION log_utwor_operations();

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
    status_code := 200;
    message := '';
    friendship_id := NULL;
    
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
    
    IF NOT EXISTS (
        SELECT 1 FROM "Uzytkownik"
        WHERE "ID_uzytkownik" = recipient_id
    ) THEN
        status_code := 404;
        message := 'Użytkownik nie istnieje';
        RETURN;
    END IF;
    
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
    
    INSERT INTO "Znajomi" ("ID_uzytkownik1", "ID_uzytkownik2", status)
    VALUES (sender_id, recipient_id, 'pending')
    RETURNING "ID_znajomych" INTO friendship_id;
    
    status_code := 201;
    message := 'Zaproszenie zostało wysłane';
END;
$$;

CREATE OR REPLACE FUNCTION liczba_polubien(id_utworu INT) 
RETURNS INT AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM "Polubienia" WHERE "ID_piosenki" = id_utworu);
END;
$$ LANGUAGE plpgsql;