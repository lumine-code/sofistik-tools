/**
 * How SOFiSTiK names the manuals in its installation root.
 *
 * Each one ships as `<name>_0.pdf` (German) and `<name>_1.pdf` (English). A few
 * carry no suffix at all, and a few exist in one language only — `tunars_0.pdf`
 * and `thermal_analysis_0.pdf` have no English counterpart in any installed
 * version, so "the wrong language" and "no manual" are different answers.
 */

const MANUAL = /^(.+?)(_[01])?\.pdf$/i;
const ENGLISH = "_1";
const GERMAN = "_0";

/**
 * The suffix for a configured language, English for anything else — the setting
 * is `language-sofistik`'s, so it is absent whenever that package is not
 * installed.
 *
 * @param {string} language - `"English"`, `"German"`, or nothing
 * @returns {string} `"_1"` or `"_0"`
 */
function suffixForLanguage(language) {
  return language === "German" ? GERMAN : ENGLISH;
}

/**
 * The suffix for the language that is not the configured one.
 *
 * @param {string} language - `"English"`, `"German"`, or nothing
 * @returns {string} `"_1"` or `"_0"`
 */
function otherSuffix(language) {
  return suffixForLanguage(language) === ENGLISH ? GERMAN : ENGLISH;
}

module.exports = { MANUAL, suffixForLanguage, otherSuffix };
