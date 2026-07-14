# Ring HomePod Doorbell

Eine selbst gehostete Bridge für:

```text
Ring-Tastendruck → eigener Klingelton → ausgewählte HomePods
```

Die App empfängt das Klingelereignis über `ring-client-api`. Ein eigener
OwnTone-Dienst spielt die hochgeladene Audiodatei synchron auf mehreren
AirPlay-Lautsprechern ab. Die Weboberfläche verwaltet Klingelton, HomePods,
Lautstärke und eine Sperrzeit gegen doppelte Ring-Ereignisse.

## Voraussetzungen

- Ring-Konto mit eingerichteter Doorbell
- HomePods und Runtipi-Server im selben lokalen Netzwerk/VLAN
- Apple Home: **Einstellungen des Zuhauses → Lautsprecher & TV → Alle im
  selben Netzwerk**
- Docker Compose oder Runtipi

> Die Ring-Anbindung verwendet eine inoffizielle API. Änderungen aufseiten von
> Ring können deshalb künftig ein Update der App notwendig machen.

## Ring Refresh-Token erzeugen

Auf einem vertrauenswürdigen Rechner mit Node.js:

```bash
npx -p ring-client-api ring-auth-cli
```

Der Token ist ein Geheimnis und darf nicht in Git eingecheckt werden.

## Lokal mit Docker Compose starten

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose logs -f
```

Danach `http://IP-DES-SERVERS:8585` öffnen, eine Audiodatei hochladen, die
HomePods auswählen und **Klingelton testen** drücken.

Persistente Daten liegen in `data/`:

- `data/settings.json`: Lautsprecher- und Wiedergabeeinstellungen
- `data/media/`: hochgeladener Klingelton
- `data/owntone-cache/`: OwnTone-Datenbank und AirPlay-Zustand
- `data/ring-refresh-token.txt`: automatisch aktualisierter Ring-Token

## Runtipi installieren

Dieses Repository ist gleichzeitig ein persönlicher Runtipi-App-Store. Füge in
Runtipi unter **Einstellungen → App Stores** diese URL hinzu:

```text
https://github.com/alexholzreiter/ring-homepod-doorbell
```

Runtipi findet die App anschließend unter:

```text
apps/ring-homepod-doorbell/
├── config.json
├── docker-compose.yml
├── owntone.conf
└── metadata/
    ├── description.md
    └── logo.jpg
```

Das Verzeichnis `runtipi/` enthält zusätzlich dieselbe Appdefinition als
einzeln kopierbares Paket.

Die App verwendet das Image
`ghcr.io/alexholzreiter/ring-homepod-doorbell:0.2.1`. Der Workflow
`.github/workflows/container.yml` veröffentlicht es für `amd64` und `arm64`,
sobald das Git-Tag `v0.2.1` gepusht wird.

Nach der ersten Veröffentlichung muss das Container-Paket auf GitHub öffentlich
sichtbar sein, damit Runtipi es ohne Registry-Anmeldung laden kann.

Runtipi muss Host-Networking erlauben. Das ist nötig, damit OwnTone die
HomePods per mDNS findet und AirPlay-Verbindungen aufbauen kann. Die App ist
bewusst nicht über Runtipi ins Internet exponierbar.

## Optionaler Apple-HomeKit-Gong

`HOMEKIT_ENABLED=true` veröffentlicht zusätzlich eine virtuelle
HomeKit-Türklingel. Nach dem Koppeln kann Apple seinen normalen Gong auf den
HomePods wiedergeben. Das ist für den eigenen Klingelton nicht erforderlich
und kann bei Aktivierung zu zwei direkt aufeinanderfolgenden Gongs führen.

Kopplung in Apple Home:

1. **+ → Gerät hinzufügen → Weitere Optionen** öffnen.
2. `Ring Haustür` auswählen.
3. `HOMEKIT_PIN` eingeben.

## Verhalten und Grenzen

- OwnTone übernimmt für die Dauer des Klingeltons die AirPlay-Ausgabe. Bereits
  laufende Musik auf einem HomePod kann dadurch unterbrochen werden.
- Die Lautstärke und die zuvor in OwnTone gewählten Ausgänge werden nach dem
  Klingelton wiederhergestellt.
- Ein leeres Lautsprecher-Set mit aktivierter Option „Alle“ umfasst jedes
  gefundene AirPlay-Gerät, also gegebenenfalls auch Apple TVs oder andere
  AirPlay-Lautsprecher.
- Bei getrennten VLANs müssen mDNS und die dynamischen AirPlay-Ports zwischen
  Server und HomePods geroutet werden.

## Entwicklung

```bash
npm install
npm test
docker compose config
docker build -t ring-homepod-doorbell:test .
```

Status-Endpunkte:

- `GET /api/status`
- `GET /health` (`200`, wenn Ring und OwnTone verbunden sind; sonst `503`)
