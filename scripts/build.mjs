import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const siteUrl = (process.env.VITE_SITE_URL || "https://www.ixia.online").replace(/\/$/, "");
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

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyHtmlFile("index.html", "index.html");
for (const page of htmlPages.filter(Boolean)) {
  copyHtmlFile(path.join(page, "index.html"), path.join(page, "index.html"));
}
copyDir("public", dist);

const robots = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /thank-you/",
  "",
  "# AI crawlers — explicitly allowed for GEO/AEO indexing",
  "User-agent: GPTBot",
  "Allow: /",
  "",
  "User-agent: OAI-SearchBot",
  "Allow: /",
  "",
  "User-agent: ChatGPT-User",
  "Allow: /",
  "",
  "User-agent: anthropic-ai",
  "Allow: /",
  "",
  "User-agent: ClaudeBot",
  "Allow: /",
  "",
  "User-agent: PerplexityBot",
  "Allow: /",
  "",
  "User-agent: Google-Extended",
  "Allow: /",
  "",
  "User-agent: Bingbot",
  "Allow: /",
  "",
  "User-agent: Applebot",
  "Allow: /",
  "",
  "User-agent: DuckDuckBot",
  "Allow: /",
  "",
  "User-agent: ia_archiver",
  "Allow: /",
  "",
  `Sitemap: ${siteUrl}/sitemap.xml`,
  `LLMs: ${siteUrl}/llms.txt`,
].join("\n") + "\n";
fs.writeFileSync(path.join(dist, "robots.txt"), robots);

const urls = htmlPages
  .map((page) => {
    const suffix = page ? `/${page}/` : "/";
    const priority = page === "" ? "1.0" : page === "audit" || page === "services" ? "0.8" : page === "compare" || page.startsWith("compare/") || page === "for" || page.startsWith("for/") ? "0.7" : page === "blog" ? "0.7" : page.startsWith("blog/") ? "0.65" : "0.6";
    return `  <url>\n    <loc>${siteUrl}${suffix}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  })
  .join("\n");

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);

console.log(`Built IXIA Online into ${dist}`);

function copyFile(from, to) {
  const src = path.join(root, from);
  const dst = path.join(dist, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyHtmlFile(from, to) {
  const src = path.join(root, from);
  const dst = path.join(dist, to);
  const html = fs.readFileSync(src, "utf8");
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, html);
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
