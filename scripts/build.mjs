import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const siteUrl = (process.env.VITE_SITE_URL || "https://www.ixia.online").replace(/\/$/, "");
const apexHost = process.env.VITE_APEX_HOST || "ixia.online";
const canonicalHost = process.env.VITE_CANONICAL_HOST || "www.ixia.online";
const apexRedirectSnippet = `    <script>\n      if (window.location.hostname === "${apexHost}") {\n        window.location.replace("https://${canonicalHost}" + window.location.pathname + window.location.search + window.location.hash);\n      }\n    </script>\n`;
const htmlPages = [
  "",
  "services",
  "sectors",
  "audit",
  "contact",
  "privacy",
  "thank-you"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyHtmlFile("index.html", "index.html");
for (const page of htmlPages.filter(Boolean)) {
  copyHtmlFile(path.join(page, "index.html"), path.join(page, "index.html"));
}
copyDir("public", dist);

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
fs.writeFileSync(path.join(dist, "robots.txt"), robots);

const urls = htmlPages
  .map((page) => {
    const suffix = page ? `/${page}/` : "/";
    const priority = page === "" ? "1.0" : page === "audit" || page === "services" ? "0.8" : "0.6";
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
  const withRedirect =
    html.includes(apexRedirectSnippet) || !html.includes("</head>")
      ? html
      : html.replace("</head>", `${apexRedirectSnippet}</head>`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, withRedirect);
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
