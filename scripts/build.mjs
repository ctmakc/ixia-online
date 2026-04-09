import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const siteUrl = (process.env.VITE_SITE_URL || "https://ixia.online").replace(/\/$/, "");
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

copyFile("index.html", "index.html");
for (const page of htmlPages.filter(Boolean)) {
  copyFile(path.join(page, "index.html"), path.join(page, "index.html"));
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
