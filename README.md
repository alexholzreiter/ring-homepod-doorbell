# Ring HomePod Doorbell

Lokale Bridge:

Ring-Klingelereignis → HomeKit-Doorbell-Event → HomePod-Türklingelton.

## 1. Ring Refresh-Token erzeugen

Auf einem Rechner mit Node.js:

```bash
npx -p ring-client-api ring-auth-cli
```

Den ausgegebenen Refresh-Token in `.env` eintragen.

## 2. Starten

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose logs -f
```

Weboberfläche:

```text
http://IP-DEINES-SERVERS:8585
```

## 3. Mit Apple Home koppeln

1. Apple Home öffnen.
2. `+` → Gerät hinzufügen.
3. `Weitere Optionen`.
4. `Ring Haustür` auswählen.
5. PIN aus `.env` eingeben.
6. Bei den Türklingel-Einstellungen die gewünschten HomePod-Gongs aktivieren.

## Hinweise

- Container nutzt `network_mode: host`, damit Bonjour/mDNS im lokalen Netz funktioniert.
- `data/` enthält HomeKit-Pairingdaten und den jeweils aktuellen Ring Refresh-Token.
- Für einen neuen HomeKit-Versuch gegebenenfalls `data/hap/` löschen und die alte Bridge zuvor aus Apple Home entfernen.
- `HOMEKIT_USERNAME` muss wie eine MAC-Adresse formatiert und innerhalb deines Netzwerks eindeutig sein.
