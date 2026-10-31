#!/usr/bin/env python3
"""Builds App/Localizable.xcstrings for the locales the web app ships.

Keys are the strings the Swift compiler extracted from the app and the Live
Activity (the .stringsdata files of a build). A translation is taken from the
web (apps/web/src/i18n/locales) only where the web has exactly the same English
text; everything else is the English text marked needs_review. Nothing is
invented. Run after a build:

  python3 apps/ios-native/scripts/build-string-catalog.py <DerivedData dir>
"""
import collections
import glob
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web/src/i18n/locales"
OUT = ROOT / "apps/ios-native/App/Localizable.xcstrings"
# The web's locales; en-US is the source.
LOCALES = ["ar", "de", "en-GB", "es", "fr", "he", "ja", "ko", "zh-Hans", "zh-Hant"]


def flat(d, prefix=""):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(flat(v, f"{prefix}{k}."))
        elif isinstance(v, str):
            out[prefix + k] = v
    return out


PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def swift_format(english, translation):
    """The web's "{{name}}" placeholders as Swift formats: %@ in the English key,
    positional %1$@, %2$@ in the translation so a reordering language stays right."""
    names = PLACEHOLDER.findall(english)
    if not names:
        return english, translation
    if set(PLACEHOLDER.findall(translation)) != set(names):
        return None, None  # the translation drops or adds a placeholder: don't trust it
    key = PLACEHOLDER.sub("%@", english)
    if len(names) == 1:
        return key, PLACEHOLDER.sub("%@", translation)
    order = {name: i + 1 for i, name in enumerate(names)}
    return key, PLACEHOLDER.sub(lambda m: f"%{order[m.group(1)]}$@", translation)


def web_translations(locale, english):
    """English text (placeholders as %@) -> the web's most common translation in `locale`."""
    other = flat(json.loads((WEB / f"{locale}.json").read_text()))
    seen = collections.defaultdict(collections.Counter)
    for key, text in english.items():
        if key in other and other[key].strip():
            source, translated = swift_format(text, other[key])
            if source:
                seen[source][translated] += 1
    return {text: counts.most_common(1)[0][0] for text, counts in seen.items()}


def app_keys(derived):
    keys = set()
    for target in ("Ferni", "FerniLive"):
        pattern = f"{derived}/Build/Intermediates.noindex/Ferni.build/*/{target}.build/Objects-normal/*/*.stringsdata"
        for path in glob.glob(pattern):
            for table in json.loads(pathlib.Path(path).read_text())["tables"].values():
                keys.update(entry["key"] for entry in table)
    return keys


def main(derived):
    english = flat(json.loads((WEB / "en-US.json").read_text()))
    web = {loc: web_translations(loc, english) for loc in LOCALES}
    strings = {}
    for key in sorted(app_keys(derived)):
        locs = {}
        wordless = not any(ch.isalpha() for ch in key.replace("%@", "").replace("%lld", ""))
        for loc in LOCALES:
            value = web[loc].get(key)
            # The web sometimes leaves English in a translation file; that isn't a translation.
            if value == key and not loc.startswith("en"):
                value = None
            if wordless:
                value = key  # formats and punctuation read the same everywhere
            locs[loc] = {"stringUnit": {"state": "translated" if value else "needs_review", "value": value or key}}
        strings[key] = {"localizations": locs}
    catalog = {"sourceLanguage": "en", "strings": strings, "version": "1.0"}
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    done = sum(1 for v in strings.values() if v["localizations"]["de"]["stringUnit"]["state"] == "translated")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(strings)} strings, {done} from the web's translations")


if __name__ == "__main__":
    main(sys.argv[1])
