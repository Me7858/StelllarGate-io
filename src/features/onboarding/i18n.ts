import glossaryEn from "./content/en/glossary.json";
import tourEn from "./content/en/tour.json";
import tradeEn from "./content/en/trade.json";

// All onboarding/education copy lives in content/<locale>/*.json. Adding a
// locale means adding a folder with the same three files and an entry here —
// no component or describeTrade() changes.

export type Glossary = typeof glossaryEn;
export type GlossaryId = keyof Glossary;
export type TourContent = typeof tourEn;
export type TradeMessages = Record<string, string>;

export interface Messages {
  locale: string;
  glossary: Glossary;
  tour: TourContent;
  trade: TradeMessages;
}

const CATALOG: Record<string, Messages> = {
  en: { locale: "en", glossary: glossaryEn, tour: tourEn, trade: tradeEn },
};

export const DEFAULT_LOCALE = "en";

export function getMessages(locale: string = DEFAULT_LOCALE): Messages {
  return CATALOG[locale] ?? CATALOG[DEFAULT_LOCALE];
}

/** Replace `{name}` placeholders. Unknown placeholders are left as-is so a
 *  missing variable is visible rather than silently blank. */
export function format(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/** Looks up `<key>.one` / `<key>.other` using the locale's plural rules. */
export function plural(messages: TradeMessages, locale: string, key: string, count: number, vars: Record<string, string | number> = {}): string {
  const category = new Intl.PluralRules(locale).select(count);
  const template = messages[`${key}.${category}`] ?? messages[`${key}.other`] ?? key;
  return format(template, { count, ...vars });
}
