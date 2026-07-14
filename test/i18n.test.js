import assert from "node:assert/strict";
import test from "node:test";

import {
  localizeServerMessage,
  resolveLanguage,
  translate,
  translations,
} from "../src/public/i18n.js";

test("German and English contain the same translation keys", () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.de).sort());
});

test("stored language wins and browser language is used as fallback", () => {
  assert.equal(resolveLanguage("en", ["de-AT"]), "en");
  assert.equal(resolveLanguage(null, ["en-GB", "de-AT"]), "en");
  assert.equal(resolveLanguage(null, ["fr-FR"]), "de");
});

test("translations interpolate dynamic values", () => {
  assert.equal(translate("de", "foundOutputs", { count: 12 }), "12 gefunden");
  assert.equal(translate("en", "outputVolume", { volume: 75 }), "AirPlay · 75% volume");
});

test("known server messages are localized for the English interface", () => {
  assert.equal(
    localizeServerMessage("en", "Wähle mindestens einen HomePod aus."),
    "Select at least one HomePod."
  );
  assert.equal(
    localizeServerMessage("en", 'OwnTone hat die Audiodatei "bell.mp3" noch nicht indexiert.'),
    'OwnTone has not indexed the audio file "bell.mp3" yet.'
  );
  assert.equal(localizeServerMessage("de", "Wähle mindestens einen HomePod aus."), "Wähle mindestens einen HomePod aus.");
});
