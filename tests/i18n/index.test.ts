import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDateLocale,
  getLocale,
  getLocaleOptions,
  normalizeLocale,
  resetRuntimeLocale,
  resolveSupportedLocale,
  setRuntimeLocale,
  SUPPORTED_LOCALES,
} from "../../src/i18n/index.js";
import { en } from "../../src/i18n/en.js";
import { de } from "../../src/i18n/de.js";
import { es } from "../../src/i18n/es.js";
import { fr } from "../../src/i18n/fr.js";
import { id } from "../../src/i18n/id.js";
import { ru } from "../../src/i18n/ru.js";
import { tr } from "../../src/i18n/tr.js";
import { zh } from "../../src/i18n/zh.js";

describe("i18n/index locale helpers", () => {
  afterEach(() => {
    resetRuntimeLocale();
    vi.unstubAllEnvs();
  });

  it("resolves exact and regional locale values", () => {
    expect(resolveSupportedLocale("ru")).toBe("ru");
    expect(resolveSupportedLocale("ru-RU")).toBe("ru");
    expect(resolveSupportedLocale("en-US")).toBe("en");
    expect(resolveSupportedLocale("de")).toBe("de");
    expect(resolveSupportedLocale("fr-FR")).toBe("fr");
  });

  it("normalizes unsupported locale values with fallback", () => {
    expect(normalizeLocale("pt", "en")).toBe("en");
    expect(normalizeLocale(undefined, "ru")).toBe("ru");
  });

  it("returns date locale from locale definition", () => {
    expect(getDateLocale("ru")).toBe("ru-RU");
    expect(getDateLocale("en")).toBe("en-US");
    expect(getDateLocale("de")).toBe("de-DE");
    expect(getDateLocale("fr")).toBe("fr-FR");
  });

  it("returns locale options from a single registry", () => {
    const optionCodes = getLocaleOptions().map((option) => option.code);
    expect(optionCodes).toEqual(SUPPORTED_LOCALES);
  });

  it("prefers runtime locale override over env locale", () => {
    vi.stubEnv("BOT_LOCALE", "en");
    setRuntimeLocale("ru");

    expect(getLocale()).toBe("ru");
  });
});

describe("i18n locale parity", () => {
  function placeholders(template: string): string[] {
    return [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
      .map((match) => match[1])
      .sort();
  }

  it("keeps the English refresh strings in English", () => {
    expect(en["refresh.last_message"]).toBe("📋 Last message: {preview}");
    expect(en["refresh.subscribed"]).toBe("✅ Subscribed to session events");
    expect(en["refresh.no_topic"]).toBe("⚠️ No topic linked");
  });

  it("ships the same key set in every locale", () => {
    const expectedKeys = Object.keys(en).sort();

    for (const [name, dictionary] of Object.entries({ de, es, fr, id, ru, tr, zh })) {
      expect(Object.keys(dictionary).sort(), name).toEqual(expectedKeys);
    }
  });

  it("uses the same interpolation placeholders as English in every locale", () => {
    for (const [name, dictionary] of Object.entries({ de, es, fr, id, ru, tr, zh })) {
      for (const [key, template] of Object.entries(en)) {
        expect(placeholders(dictionary[key]), `${name}:${key}`).toEqual(placeholders(template));
      }
    }
  });
});
