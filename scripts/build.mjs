import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

// Canonical domain is apex (no www) — matches CF Pages server behaviour
const siteUrl = (process.env.VITE_SITE_URL || "https://ixia.online").replace(/\/$/, "");

const htmlPages = [
  "",
  "services",
  "sectors",
  "audit",
  "contact",
  "privacy",
  "thank-you",
  "compare",
  "compare/ai-intake-vs-hiring-receptionist",
  "compare/ai-intake-vs-crm-alone",
  "compare/ai-intake-vs-generic-chatbot",
  "for",
  "for/law-firms",
  "for/medical-clinics",
  "for/immigration-consultants",
  "for/local-service-businesses",
  "blog",
  "blog/why-service-businesses-lose-30-percent-of-leads",
  "blog/speed-to-lead-response-time-for-service-businesses",
  "blog/ai-intake-systems-for-law-firms",
  "blog/how-to-fix-your-intake-chain-in-two-weeks"
];

// Injected into every <head> before </head>
const headInject = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&display=swap">
  <meta property="og:image" content="${siteUrl}/assets/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${siteUrl}/assets/og.png">
`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyHtmlFile("index.html", "index.html");
for (const page of htmlPages.filter(Boolean)) {
  copyHtmlFile(path.join(page, "index.html"), path.join(page, "index.html"));
}
copyDir("public", dist);

// robots.txt
const robots = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /thank-you/",
  "",
  "# AI crawlers — explicitly allowed for GEO/AEO indexing",
  "User-agent: GPTBot",    "Allow: /", "",
  "User-agent: OAI-SearchBot", "Allow: /", "",
  "User-agent: ChatGPT-User",  "Allow: /", "",
  "User-agent: anthropic-ai",  "Allow: /", "",
  "User-agent: ClaudeBot",     "Allow: /", "",
  "User-agent: PerplexityBot", "Allow: /", "",
  "User-agent: Google-Extended","Allow: /", "",
  "User-agent: Bingbot",       "Allow: /", "",
  "User-agent: Applebot",      "Allow: /", "",
  "User-agent: DuckDuckBot",   "Allow: /", "",
  "User-agent: ia_archiver",   "Allow: /", "",
  `Sitemap: ${siteUrl}/sitemap.xml`,
  `LLMs: ${siteUrl}/llms.txt`,
].join("\n") + "\n";
fs.writeFileSync(path.join(dist, "robots.txt"), robots);

// sitemap.xml with lastmod
const today = new Date().toISOString().split("T")[0];
const urls = htmlPages.map(page => {
  const suffix   = page ? `/${page}/` : "/";
  const priority = page === ""                                    ? "1.0"
    : page === "audit" || page === "services"                     ? "0.9"
    : page === "sectors" || page === "contact"                    ? "0.8"
    : page === "compare" || page.startsWith("compare/")
      || page === "for" || page.startsWith("for/")               ? "0.7"
    : page === "blog"                                             ? "0.7"
    : page.startsWith("blog/")                                    ? "0.65"
    : "0.5";
  return `  <url>\n    <loc>${siteUrl}${suffix}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}).join("\n");

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);

console.log(`Built IXIA Online into ${dist}`);

function copyHtmlFile(from, to) {
  const src  = path.join(root, from);
  const dst  = path.join(dist, to);
  let   html = fs.readFileSync(src, "utf8");

  // Fix canonical domain: www.ixia.online → ixia.online everywhere
  html = html.replaceAll("https://www.ixia.online", siteUrl);

  // Inject fonts + og:image if not already present
  if (!html.includes("fonts.googleapis.com") && html.includes("</head>")) {
    html = html.replace("</head>", headInject + "</head>");
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, html);
}

function copyDir(from, to) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(to,  entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyDir(path.join(from, entry.name), dstPath);
    } else {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
