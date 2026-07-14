# Ring HomePod Doorbell

Diese App erkennt den Tastendruck einer Ring-Türklingel und spielt eine eigene
Audiodatei synchron auf ausgewählten HomePods oder anderen AirPlay-Lautsprechern
ab. Der Klingelton, die Lautsprecher, Lautstärke und Sperrzeit werden bequem in
der Weboberfläche festgelegt.

## Vor dem ersten Test

1. In Apple Home unter **Einstellungen des Zuhauses → Lautsprecher & TV** den
   Zugriff für **Alle im selben Netzwerk** erlauben.
2. Einen Klingelton in der App hochladen.
3. Die erkannten HomePods auswählen und **Klingelton testen** drücken.

Die App verwendet Host-Networking für AirPlay/mDNS. Sie sollte deshalb nur im
vertrauenswürdigen Heimnetz betrieben und nicht ins Internet freigegeben werden.

Optional kann zusätzlich eine virtuelle HomeKit-Türklingel aktiviert werden.
Diese erzeugt Apples normalen HomePod-Gong und ist für den eigenen Ton nicht
erforderlich.
