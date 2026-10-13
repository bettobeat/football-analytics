/**
 * Languages. English is the source text: every visible string is written in English in the code and passed through
 * t(); the other languages are dictionaries in src/locales/<lang>.json keyed by the English text.
 *
 * The language is part of the address (sportlikely.com/es/...), so search engines index each language separately.
 * It is fixed for the page load: switching language navigates to the same page under the other prefix.
 * Placeholders: {0}, {1} or {name}. Plurals in a translation: "{n, plural, one {# partido} other {# partidos}}".
 */
export const LANGS = {
    en: { name: 'English', locale: 'en-GB' },
    es: { name: 'Español', locale: 'es-ES' },
    pt: { name: 'Português', locale: 'pt-BR' },
    de: { name: 'Deutsch', locale: 'de-DE' },
    fr: { name: 'Français', locale: 'fr-FR' },
    it: { name: 'Italiano', locale: 'it-IT' },
    tr: { name: 'Türkçe', locale: 'tr-TR' }
};
const CODES = Object.keys(LANGS);
const KEY = 'b2b-lang';
const isLang = (x) => typeof x === 'string' && CODES.includes(x);
/** Language prefix of the current address ("/es/matches" → "es"), or null. */
export function langInPath(pathname) {
    const m = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
    return m && isLang(m[1]) ? m[1] : null;
}
function detect() {
    if (typeof window === 'undefined')
        return 'en';
    const inPath = langInPath(window.location.pathname);
    if (inPath)
        return inPath;
    return 'en';
}
/** The language of this page load. */
export const lang = detect();
/** Router basename: "" for English, "/es" for Spanish … */
export const basename = lang === 'en' ? '' : `/${lang}`;
/** Locale for dates and numbers (toLocaleDateString etc.). */
export const LOCALE = LANGS[lang].locale;
/** Address of the same page in another language. */
export function langHref(to, pathname = window.location.pathname, search = window.location.search, hash = window.location.hash) {
    const bare = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, m => (isLang(m.slice(1)) ? '' : m)) || '/';
    return `${to === 'en' ? '' : `/${to}`}${bare}${search}${hash}`;
}
/** Remember the choice and open the same page in that language. */
export function setLang(to) {
    try {
        localStorage.setItem(KEY, to);
    }
    catch {
        /* private mode */
    }
    window.location.assign(langHref(to));
}
/**
 * First visit without a language in the address: follow the browser's language (once), unless the visitor chose a
 * language before. Returns true when a redirect was started (the caller should not render).
 */
export function redirectToPreferred() {
    if (typeof window === 'undefined' || langInPath(window.location.pathname))
        return false;
    let saved = null;
    try {
        saved = localStorage.getItem(KEY);
    }
    catch {
        /* ignore */
    }
    let want = null;
    if (saved)
        want = isLang(saved) ? saved : null;
    else {
        const nav = (navigator.languages || [navigator.language]).map(l => String(l || '').slice(0, 2).toLowerCase());
        want = nav.find(isLang) || null;
    }
    if (want && want !== 'en') {
        window.location.replace(langHref(want));
        return true;
    }
    return false;
}
/* ---------- dictionary ---------- */
const LOCALE_FILES = import.meta.glob('../locales/*.json');
let dict = {};
const missing = new Set();
export async function loadLocale() {
    if (lang === 'en')
        return;
    try {
        const loader = LOCALE_FILES[`../locales/${lang}.json`];
        if (!loader)
            throw new Error('no dictionary for ' + lang);
        const mod = (await loader());
        dict = (mod.default || mod);
    }
    catch (e) {
        console.warn('locale not loaded', lang, e);
    }
}
const rules = new Intl.PluralRules(LOCALE);
/** "{n, plural, one {# partido} other {# partidos}}" → the branch for n. */
function plural(body, vars) {
    // body: "n, plural, one {...} other {...}"
    const m = body.match(/^\s*([\w]+)\s*,\s*plural\s*,\s*([\s\S]*)$/);
    if (!m)
        return body;
    const n = Number(vars[m[1]]);
    const branches = {};
    const re = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;
    let b;
    while ((b = re.exec(m[2])))
        branches[b[1]] = b[2];
    const pick = branches[`=${n}`] ?? branches[Number.isFinite(n) ? rules.select(n) : 'other'] ?? branches.other ?? '';
    return pick.replace(/#/g, String(vars[m[1]]));
}
function fill(s, vars) {
    if (!vars)
        return s;
    // plural blocks first (they contain braces of their own)
    let out = s.replace(/\{(\w+\s*,\s*plural\s*,[^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, body) => plural(body, vars));
    out = out.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k] ?? '') : all));
    return out;
}
/** Translate an English string (the key). Missing translations fall back to English. */
export function t(key, vars) {
    const s = dict[key];
    if (s === undefined && lang !== 'en' && !missing.has(key)) {
        missing.add(key);
        if (import.meta.env?.DEV)
            console.debug('[i18n] missing', lang, key);
    }
    return fill(s ?? key, vars);
}
/** Keys with no translation in this language (for a quick check in the console). */
export const missingKeys = () => [...missing];
/** <html lang> and hreflang links, for search engines. */
export function applyHeadLang(pathname) {
    document.documentElement.lang = lang;
    const bare = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, m => (isLang(m.slice(1)) ? '' : m)) || '/';
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());
    const origin = window.location.origin;
    for (const code of CODES) {
        const link = document.createElement('link');
        link.rel = 'alternate';
        link.hreflang = code;
        link.href = `${origin}${code === 'en' ? '' : `/${code}`}${bare === '/' ? '' : bare}` || origin;
        document.head.appendChild(link);
    }
    const x = document.createElement('link');
    x.rel = 'alternate';
    x.hreflang = 'x-default';
    x.href = `${origin}${bare === '/' ? '' : bare}`;
    document.head.appendChild(x);
}
