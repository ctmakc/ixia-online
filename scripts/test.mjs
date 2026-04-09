import fs from "node:fs";
import path from "node:path";

const required = [
  "index.html",
  "services/index.html",
  "sectors/index.html",
  "audit/index.html",
  "contact/index.html",
  "privacy/index.html",
  "thank-you/index.html"
];

for (const file of required) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required page: ${file}`);
  }
}

const home = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
if (!home.includes("IXIA Online")) {
  throw new Error("Home page title/content check failed.");
}

const audit = fs.readFileSync(path.join(process.cwd(), "audit/index.html"), "utf8");
if (!audit.includes("data-revenue-calculator")) {
  throw new Error("Audit calculator marker missing.");
}

console.log("Static checks passed.");
