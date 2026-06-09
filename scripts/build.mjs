import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

// Canonical domain is apex (no www) — matches CF Pages server behaviour
const siteUrl = (process.env.VITE_SITE_URL || "https://ixia.online").replace(/\/$/, "");

// ── LOCALES ───────────────────────────────────────────────
const dict = {
  fr: JSON.parse(fs.readFileSync(path.join(root, "i18n/fr.json"), "utf8")),
  ru: JSON.parse(fs.readFileSync(path.join(root, "i18n/ru.json"), "utf8")),
};
const LOCALES = [
  { code: "en", dir: "",   ogLocale: "en_US", label: "English" },
  { code: "fr", dir: "fr", ogLocale: "fr_FR", label: "Français" },
  { code: "ru", dir: "ru", ogLocale: "ru_RU", label: "Русский" },
];

// one flexible-whitespace regex per language (keys longest-first for greedy priority)
const escapeRe = (k) =>
  k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const buildRe = (d) =>
  new RegExp(
    Object.keys(d).sort((a, b) => b.length - a.length).map(escapeRe).join("|"),
    "g"
  );
const transRe = { fr: buildRe(dict.fr), ru: buildRe(dict.ru) };

// Promo → platform access links
const APP_URL = process.env.IXIA_APP_URL || 'https://app.ixia.online';
const APP_LABELS = {
  en: { login: 'Log in', trial: 'Start free trial' },
  fr: { login: 'Connexion', trial: 'Essai gratuit' },
  ru: { login: 'Войти', trial: 'Бесплатный триал' },
};

const htmlPages = [
  "", "services", "sectors", "audit", "contact", "privacy", "thank-you",
  "compare",
  "compare/ai-intake-vs-hiring-receptionist",
  "compare/ai-intake-vs-crm-alone",
  "compare/ai-intake-vs-generic-chatbot",
  "for", "for/law-firms", "for/medical-clinics",
  "for/immigration-consultants", "for/local-service-businesses",
  "blog",
  "blog/why-service-businesses-lose-30-percent-of-leads",
  "blog/speed-to-lead-response-time-for-service-businesses",
  "blog/ai-intake-systems-for-law-firms",
  "blog/how-to-fix-your-intake-chain-in-two-weeks",
];

// Font preloads + og defaults injected into every <head>
const headInject = `  <link rel="preload" href="/assets/fonts/bricolage-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/archivo-normal.woff2" as="font" type="font/woff2" crossorigin>
  <meta name="theme-color" content="#e8ebef">
  <meta property="og:image" content="${siteUrl}/assets/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${siteUrl}/assets/og.png">
`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const page of htmlPages) {
  const src = path.join(root, page, "index.html");
  if (!fs.existsSync(src)) continue;
  const raw = fs.readFileSync(src, "utf8");
  for (const loc of LOCALES) {
    const out = renderPage(raw, page, loc);
    const dstDir = path.join(dist, loc.dir, page);
    fs.mkdirSync(dstDir, { recursive: true });
    fs.writeFileSync(path.join(dstDir, "index.html"), out);
  }
}

copyDir("public", dist);
writeRobots();
writeSitemap();

console.log(`Built IXIA Online (en/fr/ru) into ${dist}`);

// ── RENDER ────────────────────────────────────────────────
function pagePath(page) { return page ? `/${page}/` : "/"; }
function localeUrl(loc, page) { return `${siteUrl}${loc.dir ? "/" + loc.dir : ""}${pagePath(page)}`; }
function localePath(loc, page) { return `${loc.dir ? "/" + loc.dir : ""}${pagePath(page)}`; }

function renderPage(raw, page, loc) {
  let html = raw.replaceAll("https://www.ixia.online", siteUrl);

  if (loc.dir) html = translate(html, loc.code);
  if (loc.dir) html = localiseLinks(html, loc);

  html = html.replace(/<html[^>]*\blang="[^"]*"/i, `<html lang="${loc.code}"`);

  const selfUrl = localeUrl(loc, page);
  html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${selfUrl}" />`);
  if (/<meta property="og:url"/i.test(html))
    html = html.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${selfUrl}" />`);

  if (!html.includes("bricolage-normal.woff2") && html.includes("</head>"))
    html = html.replace("</head>", headInject + "</head>");
  html = html.replace(/\s*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "");

  const alts = LOCALES.map(l =>
    `  <link rel="alternate" hreflang="${l.code}" href="${localeUrl(l, page)}">`
  ).join("\n") +
    `\n  <link rel="alternate" hreflang="x-default" href="${localeUrl(LOCALES[0], page)}">\n` +
    `  <meta property="og:locale" content="${loc.ogLocale}">\n`;
  html = html.replace("</head>", alts + "</head>");

  html = injectLangSwitch(html, page, loc);
  return html;
}

function translate(html, code) {
  const d = dict[code];
  // protect <script>, <style>, comments with text sentinels
  const stash = [];
  const protect = (rx) => {
    html = html.replace(rx, (m) => { stash.push(m); return `@@IXIASTASH${stash.length - 1}@@`; });
  };
  protect(/<script[\s\S]*?<\/script>/gi);
  protect(/<style[\s\S]*?<\/style>/gi);
  protect(/<!--[\s\S]*?-->/g);
  // flexible-whitespace match; normalise the hit and look up the dict
  html = html.replace(transRe[code], (m) => {
    const key = m.replace(/\s+/g, " ").trim();
    const v = d[key];
    return (v && v !== key) ? v : m;
  });
  html = html.replace(/@@IXIASTASH(\d+)@@/g, (_, i) => stash[+i]);
  return html;
}

function localiseLinks(html, loc) {
  return html.replace(/(href|action)="(\/[^"]*)"/g, (m, attr, url) => {
    if (/^\/(assets|fonts|favicon|robots|sitemap|site\.webmanifest|llms)/.test(url)) return m;
    if (/\.(png|jpg|jpeg|svg|webp|ico|txt|xml|webmanifest|pdf)$/i.test(url)) return m;
    if (new RegExp(`^/${loc.dir}(/|$)`).test(url)) return m;
    return `${attr}="/${loc.dir}${url}"`;
  });
}

function injectLangSwitch(html, page, loc) {
  const items = LOCALES.map(l => {
    const cur = l.code === loc.code ? ' aria-current="true"' : "";
    return `<a href="${localePath(l, page)}" hreflang="${l.code}"${cur}>${l.code.toUpperCase()}</a>`;
  }).join("");
  const sw = `<div class="lang-switch" role="group" aria-label="Language / Langue / Язык">${items}</div>`;
  const A = APP_LABELS[loc.code] || APP_LABELS.en;
  const appLinks = `<a class="nav-login" href="${APP_URL}/login">${A.login}</a>`
    + `<a class="nav-trial" href="${APP_URL}/signup">${A.trial}</a>`;
  return html.replace(/<\/nav>/i, appLinks + sw + "</nav>");
}

// ── ASSETS ────────────────────────────────────────────────
function writeRobots() {
  const robots = [
    "User-agent: *", "Allow: /", "Disallow: /thank-you/", "",
    "# AI crawlers — explicitly allowed for GEO/AEO indexing",
    "User-agent: GPTBot", "Allow: /", "",
    "User-agent: OAI-SearchBot", "Allow: /", "",
    "User-agent: ChatGPT-User", "Allow: /", "",
    "User-agent: anthropic-ai", "Allow: /", "",
    "User-agent: ClaudeBot", "Allow: /", "",
    "User-agent: PerplexityBot", "Allow: /", "",
    "User-agent: Google-Extended", "Allow: /", "",
    "User-agent: Bingbot", "Allow: /", "",
    "User-agent: Applebot", "Allow: /", "",
    "User-agent: DuckDuckBot", "Allow: /", "",
    "User-agent: ia_archiver", "Allow: /", "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    `LLMs: ${siteUrl}/llms.txt`,
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(dist, "robots.txt"), robots);
}

function writeSitemap() {
  const today = new Date().toISOString().split("T")[0];
  const priorityOf = (page) =>
      page === "" ? "1.0"
    : page === "audit" || page === "services" ? "0.9"
    : page === "sectors" || page === "contact" ? "0.8"
    : page === "compare" || page.startsWith("compare/") || page === "for" || page.startsWith("for/") ? "0.7"
    : page === "blog" ? "0.7"
    : page.startsWith("blog/") ? "0.65"
    : "0.5";

  const entries = [];
  for (const page of htmlPages) {
    for (const loc of LOCALES) {
      const alts = LOCALES.map(l =>
        `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${localeUrl(l, page)}"/>`
      ).join("\n") +
        `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${localeUrl(LOCALES[0], page)}"/>`;
      entries.push(
        `  <url>\n    <loc>${localeUrl(loc, page)}</loc>\n    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n    <priority>${priorityOf(page)}</priority>\n${alts}\n  </url>`
      );
    }
  }
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries.join("\n") + `\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);
}

function copyDir(from, to) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyDir(path.join(from, entry.name), dstPath);
    } else {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
