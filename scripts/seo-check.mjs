// Technical SEO checker for the built site (dist/). Zero dependencies.
// Usage: npm run build && npm run seo:check
// Exits 1 if any error is found; warnings are printed but do not fail.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
if (!fs.existsSync(dist)) {
  console.error(`No build output at ${dist}. Run "npm run build" first.`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ── helpers ───────────────────────────────────────────────
const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
const stripScripts = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "");
const len = (s) => [...s].length;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

// URL path ("/fr/blog/") for a built file
const routeOf = (file) => {
  const rel = path.relative(dist, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
};

// Site origin: from the home page canonical
const homeHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const homeCanon = attr(tags(homeHtml, "link").find((t) => /rel=["']?canonical/i.test(t)) || "", "href");
const origin = homeCanon ? new URL(homeCanon).origin : null;
if (!origin) err("/", "home page has no canonical; cannot determine site origin");

// Redirect sources (Cloudflare Pages _redirects)
const redirects = new Set();
const redirFile = path.join(dist, "_redirects");
if (fs.existsSync(redirFile)) {
  for (const line of fs.readFileSync(redirFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    redirects.add(t.split(/\s+/)[0]);
  }
}

// Does an internal path resolve to a built file (or a redirect)?
function resolves(p) {
  const clean = decodeURIComponent(p.split(/[?#]/)[0]);
  if (redirects.has(clean)) return true;
  const f = path.join(dist, clean);
  if (clean.endsWith("/")) return fs.existsSync(path.join(f, "index.html"));
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return true;
  // Pages serves /foo for /foo/index.html (via redirect to /foo/)
  return fs.existsSync(path.join(f, "index.html"));
}

// Internal URL → path, or null if external
function internalPath(href) {
  if (!href) return null;
  if (/^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;
  if (href.startsWith("//")) href = "https:" + href;
  if (/^https?:\/\//i.test(href)) {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    if (!origin || host !== new URL(origin).hostname.replace(/^www\./, "")) return null;
    return u.pathname + u.search;
  }
  if (href.startsWith("/")) return href;
  return "REL:" + href;
}

// ── JSON-LD rules ─────────────────────────────────────────
const typesOf = (n) => [].concat(n["@type"] || []);
const has = (n, k) => {
  const v = n[k];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};
const REQUIRED = {
  Organization: ["name", "url"],
  ProfessionalService: ["name", "url"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  Service: ["name", "provider", "areaServed"],
  Article: ["headline", "datePublished", "author"],
  BlogPosting: ["headline", "datePublished", "author"],
  NewsArticle: ["headline", "datePublished", "author"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  BreadcrumbList: ["itemListElement"],
  FAQPage: ["mainEntity"],
  WebPage: ["name"],
};
function checkLd(where, node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) { node.forEach((n) => checkLd(where, n, seen)); return; }
  // a bare reference ({"@type","@id"}) points at an entity described elsewhere
  const isRef = Object.keys(node).every((k) => k === "@type" || k === "@id") && node["@id"];
  for (const t of isRef ? [] : typesOf(node)) {
    if (t === "HowTo") err(where, "JSON-LD HowTo markup (retired by Google in 2023) should be removed");
    for (const k of REQUIRED[t] || []) if (!has(node, k)) err(where, `JSON-LD ${t} missing "${k}"`);
    if (["Article", "BlogPosting", "NewsArticle"].includes(t)) {
      for (const a of [].concat(node.author || [])) {
        if (typeof a === "object" && !has(a, "name")) err(where, `JSON-LD ${t}.author missing "name"`);
      }
      if (node.datePublished && isNaN(Date.parse(node.datePublished))) err(where, `JSON-LD ${t}.datePublished not a date`);
    }
    if (t === "BreadcrumbList") {
      [].concat(node.itemListElement || []).forEach((li, i) => {
        if (!li || li["@type"] !== "ListItem") err(where, `BreadcrumbList item ${i + 1} is not a ListItem`);
        else {
          if (li.position !== i + 1) err(where, `BreadcrumbList item ${i + 1} position is ${li.position}`);
          if (!has(li, "name") && !(li.item && li.item.name)) err(where, `BreadcrumbList item ${i + 1} missing name`);
          const last = i === node.itemListElement.length - 1;
          if (!last && !has(li, "item")) err(where, `BreadcrumbList item ${i + 1} missing item URL`);
          const u = typeof li.item === "string" ? li.item : li.item && li.item["@id"];
          if (u) { const ip = internalPath(u); if (ip && !ip.startsWith("REL:") && !resolves(ip)) err(where, `BreadcrumbList item URL ${u} does not resolve`); }
        }
      });
    }
    if (t === "FAQPage") {
      for (const q of [].concat(node.mainEntity || [])) {
        if (!q || !has(q, "name") || !q.acceptedAnswer || !has(q.acceptedAnswer, "text"))
          err(where, "FAQPage Question missing name or acceptedAnswer.text");
      }
    }
  }
  for (const [k, v] of Object.entries(node)) if (!k.startsWith("@") || k === "@graph") checkLd(where, v, seen);
}

// ── per-page checks ───────────────────────────────────────
const files = walk(dist);
const pages = new Map(); // route -> info
for (const file of files) {
  const route = routeOf(file);
  const html = fs.readFileSync(file, "utf8");
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [""])[0];
  const robotsMeta = tags(head, "meta").filter((t) => attr(t, "name")?.toLowerCase() === "robots").map((t) => attr(t, "content") || "").join(",");
  const noindex = /noindex/i.test(robotsMeta);
  const metaBy = (key, val) => tags(head, "meta").filter((t) => (attr(t, key) || "").toLowerCase() === val);
  const titles = head.match(/<title[^>]*>([\s\S]*?)<\/title>/gi) || [];
  const title = titles.length ? decode(titles[0].replace(/<[^>]+>/g, "")).trim() : "";
  const descTags = metaBy("name", "description");
  const desc = descTags.length ? (attr(descTags[0], "content") || "").trim() : "";
  const links = tags(head, "link");
  const canonTags = links.filter((t) => (attr(t, "rel") || "").toLowerCase() === "canonical");
  const canonical = canonTags.length ? attr(canonTags[0], "href") : null;
  const alternates = links
    .filter((t) => (attr(t, "rel") || "").toLowerCase() === "alternate" && attr(t, "hreflang"))
    .map((t) => ({ lang: attr(t, "hreflang"), href: attr(t, "href") }));
  pages.set(route, { file, route, html, head, noindex, title, desc, canonical, alternates, titleCount: titles.length, descCount: descTags.length, canonCount: canonTags.length, metaBy });
}

for (const p of pages.values()) {
  const { route: where, html, head, noindex } = p;
  const body = stripScripts(html);
  const lang = (html.match(/<html[^>]*\slang="([^"]*)"/i) || [])[1];
  if (!lang) err(where, "<html> has no lang");

  // images (checked on every page, including noindex)
  for (const img of tags(body, "img")) {
    const src = attr(img, "src") || "";
    if (attr(img, "alt") === null) err(where, `<img src="${src}"> has no alt attribute`);
    if (attr(img, "width") === null || attr(img, "height") === null) err(where, `<img src="${src}"> missing width/height`);
    const ip = internalPath(src);
    if (ip && !ip.startsWith("REL:") && !resolves(ip)) err(where, `<img src="${src}"> file missing`);
  }

  // internal links (every page)
  for (const a of [...tags(body, "a"), ...tags(head, "link")]) {
    const href = attr(a, "href");
    const ip = internalPath(href);
    if (!ip) continue;
    if (ip.startsWith("REL:")) { warn(where, `relative link "${href}"`); continue; }
    if (ip.startsWith("/api/")) continue;
    if (!resolves(ip)) err(where, `internal link to missing route ${href}`);
  }

  // JSON-LD
  const lds = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of lds) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { err(where, `JSON-LD parse error: ${e.message}`); continue; }
    checkLd(where, data);
  }

  if (where === "/404.html") continue; // error page: only asset/link checks above
  if (noindex) continue;               // noindex pages (thank-you): no SEO meta rules

  // title / description
  if (p.titleCount !== 1) err(where, `${p.titleCount} <title> elements`);
  const tl = len(p.title);
  if (tl < 30 || tl > 60) err(where, `title is ${tl} chars (30-60): "${p.title}"`);
  if (p.descCount !== 1) err(where, `${p.descCount} meta descriptions`);
  const dl = len(p.desc);
  if (dl < 70 || dl > 160) err(where, `meta description is ${dl} chars (70-160): "${p.desc}"`);

  // headings
  const h1s = (body.match(/<h1\b/gi) || []).length;
  if (h1s !== 1) err(where, `${h1s} <h1> elements (want exactly 1)`);

  // canonical: one, absolute, no query/hash, self-referencing
  if (p.canonCount !== 1) err(where, `${p.canonCount} canonical links`);
  if (p.canonical) {
    let u;
    try { u = new URL(p.canonical); } catch { err(where, `canonical not absolute: ${p.canonical}`); }
    if (u) {
      if (u.search || u.hash) err(where, `canonical has query/hash: ${p.canonical}`);
      if (origin && u.origin !== origin) err(where, `canonical origin ${u.origin} != ${origin}`);
      if (u.pathname !== where) err(where, `canonical ${p.canonical} is not self-referencing`);
    }
  }

  // og
  for (const k of ["og:title", "og:description", "og:image", "og:url"]) {
    const t = p.metaBy("property", k);
    if (!t.length || !(attr(t[0], "content") || "").trim()) err(where, `missing ${k}`);
  }
  const ogImg = p.metaBy("property", "og:image")[0];
  if (ogImg) { const ip = internalPath(attr(ogImg, "content")); if (ip && !resolves(ip)) err(where, "og:image file missing"); }
  const ogUrl = p.metaBy("property", "og:url")[0];
  if (ogUrl && p.canonical && attr(ogUrl, "content") !== p.canonical) err(where, "og:url differs from canonical");

  // hreflang
  if (p.alternates.length) {
    const langs = p.alternates.map((a) => a.lang);
    if (!langs.includes("x-default")) err(where, "hreflang set has no x-default");
    if (new Set(langs).size !== langs.length) err(where, "duplicate hreflang values");
    if (!p.alternates.some((a) => a.href === p.canonical)) err(where, "hreflang set does not include the page itself");
    if (lang && !p.alternates.some((a) => a.lang === lang && a.href === p.canonical)) err(where, `hreflang="${lang}" does not point to self`);
    for (const a of p.alternates) {
      const ip = internalPath(a.href);
      if (!ip) { err(where, `hreflang ${a.lang} points off-site: ${a.href}`); continue; }
      const target = pages.get(ip);
      if (!target) { err(where, `hreflang ${a.lang} target ${a.href} not built`); continue; }
      if (target.noindex) err(where, `hreflang ${a.lang} target ${a.href} is noindex`);
      if (a.lang !== "x-default" && !target.alternates.some((b) => b.href === p.canonical))
        err(where, `hreflang ${a.lang} → ${a.href} does not link back (not reciprocal)`);
    }
  } else warn(where, "no hreflang alternates");
}

// uniqueness of title/description among indexable pages
const indexable = [...pages.values()].filter((p) => !p.noindex && p.route !== "/404.html");
for (const key of ["title", "desc"]) {
  const by = new Map();
  for (const p of indexable) if (p[key]) by.set(p[key], [...(by.get(p[key]) || []), p.route]);
  for (const [v, routes] of by) if (routes.length > 1)
    err(routes.join(", "), `duplicate ${key === "title" ? "title" : "meta description"}: "${v}"`);
}

// ── sitemap.xml ───────────────────────────────────────────
const smFile = path.join(dist, "sitemap.xml");
if (!fs.existsSync(smFile)) err("sitemap.xml", "missing");
else {
  const sm = fs.readFileSync(smFile, "utf8");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1].trim()));
  const inSitemap = new Set();
  for (const loc of locs) {
    const ip = internalPath(loc);
    if (!ip) { err("sitemap.xml", `off-site URL ${loc}`); continue; }
    if (inSitemap.has(ip)) err("sitemap.xml", `duplicate <loc> ${loc}`);
    inSitemap.add(ip);
    const p = pages.get(ip);
    if (!p) err("sitemap.xml", `${loc} has no built page`);
    else if (p.noindex) err("sitemap.xml", `${loc} is noindex`);
    else if (p.canonical !== loc) err("sitemap.xml", `${loc} canonical is ${p.canonical}`);
  }
  for (const p of indexable) if (!inSitemap.has(p.route)) err("sitemap.xml", `indexable page ${p.route} not listed`);
  for (const m of sm.matchAll(/<xhtml:link[^>]*href="([^"]+)"/g)) {
    const ip = internalPath(m[1]);
    if (!ip || !pages.get(ip)) err("sitemap.xml", `xhtml:link target ${m[1]} not built`);
  }
}

// ── robots.txt ────────────────────────────────────────────
const rbFile = path.join(dist, "robots.txt");
if (!fs.existsSync(rbFile)) err("robots.txt", "missing");
else {
  const rb = fs.readFileSync(rbFile, "utf8");
  const groups = [];
  let cur = null;
  for (const raw of rb.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase(), val = rest.join(":").trim();
    if (key === "user-agent") { if (!cur || cur.rules.length) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(val); }
    else if (key === "allow" || key === "disallow") { if (!cur) err("robots.txt", `${k} before any User-agent`); else cur.rules.push([key, val]); }
    else if (key === "sitemap") {
      if (origin && val !== `${origin}/sitemap.xml`) err("robots.txt", `Sitemap: ${val} (expected ${origin}/sitemap.xml)`);
    } else if (!["crawl-delay", "host"].includes(key)) warn("robots.txt", `non-standard directive "${k.trim()}"`);
  }
  if (!/^sitemap:/im.test(rb)) err("robots.txt", "no Sitemap: line");
  for (const g of groups) for (const [k, v] of g.rules) {
    if (k === "disallow" && v === "/") err("robots.txt", `Disallow: / for ${g.agents.join(", ")}`);
    if (k === "disallow" && v) for (const p of indexable) if (p.route.startsWith(v) && g.agents.includes("*"))
      err("robots.txt", `Disallow: ${v} blocks indexable page ${p.route}`);
  }
}

// ── report ────────────────────────────────────────────────
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\nseo-check: ${pages.size} HTML files, ${indexable.length} indexable; ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
