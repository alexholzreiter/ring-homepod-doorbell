export const DEFAULT_LANGUAGE = "de";
export const SUPPORTED_LANGUAGES = ["de", "en"];

export const translations = {
  de: {
    active: "Aktiv",
    allAirPlaySpeakers: "Alle AirPlay-Lautsprecher",
    audioFormats: "MP3, WAV, M4A, AAC, FLAC oder OGG",
    authRequired: "Freigabe nötig",
    avoidDuplicateRings: "Doppeltes Klingeln vermeiden",
    bridgeStarted: "Bridge gestartet",
    changesSavedOnServer: "Änderungen werden auf deinem Server gespeichert.",
    checking: "Wird geprüft …",
    chimeReady: "Bereit",
    chimeUploaded: "Klingelton wurde hochgeladen und von OwnTone erkannt.",
    chooseAudioFile: "Audiodatei auswählen",
    chooseChime: "Klingelton auswählen",
    chooseChimeDescription: "Lade deinen persönlichen Sound hoch.",
    chooseHomePods: "HomePods auswählen",
    chooseHomePodsDescription: "Bestimme, wo der Klingelton abgespielt wird.",
    connectionStatus: "Verbindungsstatus",
    connected: "Verbunden",
    cooldown: "Sperrzeit",
    documentTitle: "Ring HomePod Doorbell",
    everythingAtAGlance: "Alles im Blick.",
    footerDescription: "Private Smart-Home-Bridge · lokal betrieben",
    foundOutputs: "{count} gefunden",
    helpDescription: "Prüfe Ring-Token und Netzwerkzugriff.",
    heroAccent: "Dein Sound.",
    heroDescription: "Wenn es an der Ring Doorbell klingelt, hören es alle ausgewählten HomePods – mit genau dem Ton, den du möchtest.",
    heroLabel: "Bereit für deinen Besuch",
    heroTitle: "Deine Klingel.",
    homeLink: "HomePod Doorbell Startseite",
    homePodHelp: "Kein HomePod sichtbar? Erlaube in Apple Home unter „Lautsprecher & TV“ den Zugriff für alle im selben Netzwerk.",
    includeNewHomePods: "Neue HomePods automatisch einbeziehen",
    languageSwitcher: "Sprache auswählen",
    lastError: "Letzter Fehler",
    lastPlayback: "Letzte Wiedergabe",
    lastRing: "Letztes Klingeln",
    liveStatus: "LIVE-STATUS",
    localOnly: "Nur lokal",
    loud: "Laut",
    mainNavigation: "Hauptnavigation",
    needHelp: "Brauchst du Hilfe?",
    noOutputs: "Keine AirPlay-Lautsprecher gefunden.",
    notConnected: "Nicht verbunden",
    notReachable: "Nicht erreichbar",
    notSelected: "Nicht gewählt",
    openSetup: "Einrichtung öffnen",
    outputVolume: "AirPlay · {volume} % Lautstärke",
    playbackSettings: "Wiedergabe einstellen",
    playbackSettingsDescription: "So laut und so oft, wie es für dein Zuhause passt.",
    quiet: "Leise",
    refreshDevices: "Geräte neu suchen",
    savedLocally: "Lokal gespeichert",
    saveSettings: "Einstellungen speichern",
    searchingNetwork: "Suche im lokalen Netzwerk …",
    secondsShort: "Sek.",
    settingsSaved: "Einstellungen und Gerätelautstärke gespeichert.",
    setupKicker: "EINRICHTUNG",
    setupTitle: "In drei Schritten startklar",
    statusLoadFailed: "Status konnte nicht geladen werden: {message}",
    systemDetails: "Systemdetails",
    testChime: "Klingelton testen",
    testSucceeded: "Testklingeln wurde erfolgreich abgespielt.",
    tipCoffee: "Auf einen Kaffee einladen",
    upload: "Hochladen",
    volume: "Lautstärke",
    waitingForRing: "Die Bridge wartet auf das nächste Klingelereignis deiner Ring Doorbell.",
  },
  en: {
    active: "Active",
    allAirPlaySpeakers: "All AirPlay speakers",
    audioFormats: "MP3, WAV, M4A, AAC, FLAC or OGG",
    authRequired: "Approval required",
    avoidDuplicateRings: "Prevent duplicate rings",
    bridgeStarted: "Bridge started",
    changesSavedOnServer: "Changes are stored on your server.",
    checking: "Checking …",
    chimeReady: "Ready",
    chimeUploaded: "The chime was uploaded and detected by OwnTone.",
    chooseAudioFile: "Choose audio file",
    chooseChime: "Choose your chime",
    chooseChimeDescription: "Upload your own sound.",
    chooseHomePods: "Choose HomePods",
    chooseHomePodsDescription: "Decide where the chime should play.",
    connectionStatus: "Connection status",
    connected: "Connected",
    cooldown: "Cooldown",
    documentTitle: "Ring HomePod Doorbell",
    everythingAtAGlance: "Everything at a glance.",
    footerDescription: "Private smart home bridge · locally hosted",
    foundOutputs: "{count} found",
    helpDescription: "Check your Ring token and network access.",
    heroAccent: "Your sound.",
    heroDescription: "When someone presses your Ring Doorbell, every selected HomePod plays exactly the sound you want.",
    heroLabel: "Ready for your next visitor",
    heroTitle: "Your doorbell.",
    homeLink: "HomePod Doorbell home",
    homePodHelp: "No HomePod visible? In Apple Home, allow access under “Speakers & TV” for everyone on the same network.",
    includeNewHomePods: "Automatically include new HomePods",
    languageSwitcher: "Choose language",
    lastError: "Last error",
    lastPlayback: "Last playback",
    lastRing: "Last ring",
    liveStatus: "LIVE STATUS",
    localOnly: "Local only",
    loud: "Loud",
    mainNavigation: "Main navigation",
    needHelp: "Need help?",
    noOutputs: "No AirPlay speakers found.",
    notConnected: "Not connected",
    notReachable: "Not reachable",
    notSelected: "Not selected",
    openSetup: "Open setup",
    outputVolume: "AirPlay · {volume}% volume",
    playbackSettings: "Playback settings",
    playbackSettingsDescription: "Set the right volume and timing for your home.",
    quiet: "Quiet",
    refreshDevices: "Refresh devices",
    savedLocally: "Saved locally",
    saveSettings: "Save settings",
    searchingNetwork: "Searching the local network …",
    secondsShort: "sec.",
    settingsSaved: "Settings and device volume saved.",
    setupKicker: "SETUP",
    setupTitle: "Ready in three steps",
    statusLoadFailed: "Status could not be loaded: {message}",
    systemDetails: "System details",
    testChime: "Test chime",
    testSucceeded: "The test chime played successfully.",
    tipCoffee: "Tip a coffee",
    upload: "Upload",
    volume: "Volume",
    waitingForRing: "The bridge is waiting for the next Ring Doorbell event.",
  },
};

export function resolveLanguage(storedLanguage, browserLanguages = []) {
  if (SUPPORTED_LANGUAGES.includes(storedLanguage)) return storedLanguage;
  const detected = browserLanguages.find((language) => typeof language === "string");
  const baseLanguage = detected?.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(baseLanguage) ? baseLanguage : DEFAULT_LANGUAGE;
}

export function translate(language, key, values = {}) {
  const dictionary = translations[SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE];
  const template = dictionary[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template
  );
}

const englishServerMessages = new Map([
  ["Wähle mindestens einen HomePod aus.", "Select at least one HomePod."],
  ["Einstellungen gespeichert, aber OwnTone ist gerade nicht erreichbar.", "Settings were saved, but OwnTone is currently unreachable."],
  ["Keine Audiodatei empfangen.", "No audio file was received."],
  ["Erlaubt sind MP3, WAV, M4A, AAC, FLAC und OGG.", "Allowed formats are MP3, WAV, M4A, AAC, FLAC and OGG."],
  ["Die PIN muss vierstellig sein.", "The PIN must contain four digits."],
  ["Testklingeln fehlgeschlagen.", "The test chime failed."],
  ["Die Audiodatei darf höchstens 15 MB groß sein.", "The audio file must not exceed 15 MB."],
  ["Noch kein eigener Klingelton hochgeladen.", "No custom chime has been uploaded yet."],
  ["Keine ausgewählten, erreichbaren AirPlay-Lautsprecher gefunden.", "No selected and reachable AirPlay speakers were found."],
  ["Im Ring-Konto wurde keine Kamera gefunden.", "No camera was found in the Ring account."],
]);

export function localizeServerMessage(language, message) {
  if (language !== "en" || !message || message === "–") return message;
  if (englishServerMessages.has(message)) return englishServerMessages.get(message);

  const replacements = [
    [
      /^OwnTone hat die Audiodatei "(.+)" noch nicht indexiert\.$/,
      (_match, filename) => `OwnTone has not indexed the audio file "${filename}" yet.`,
    ],
    [
      /^Nicht erreichbare AirPlay-Ausgänge: (.+)$/,
      (_match, outputs) => `Unreachable AirPlay outputs: ${outputs}`,
    ],
    [
      /^Ring-Kamera "(.+)" nicht gefunden\. Verfügbar: (.+)$/,
      (_match, camera, available) => `Ring camera "${camera}" was not found. Available: ${available}`,
    ],
    [
      /^Webserver konnte nicht gestartet werden: (.+)$/,
      (_match, details) => `The web server could not be started: ${details}`,
    ],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}
