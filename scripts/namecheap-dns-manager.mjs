import process from "node:process";

const command = process.argv[2];

const credentials = {
  apiUser: process.env.NAMECHEAP_API_USER,
  username: process.env.NAMECHEAP_USERNAME,
  apiKey: process.env.NAMECHEAP_API_KEY,
  clientIp: process.env.NAMECHEAP_CLIENT_IP
};

const domainName = requiredEnv("NAMECHEAP_DOMAIN");
const dnsTarget = (
  process.env.NAMECHEAP_DNS_TARGET ||
  process.env.CLOUDFLARE_DNS_TARGET ||
  `${process.env.CLOUDFLARE_PAGES_PROJECT || process.env.npm_package_name || "site"}.pages.dev`
).trim().replace(/\.$/, "");
const ttl = String(Number.parseInt(process.env.NAMECHEAP_DNS_TTL || "300", 10) || 300);
const dryRun = parseBoolean(process.env.NAMECHEAP_DRY_RUN, false);
const domains = parseList(process.env.CLOUDFLARE_PAGES_DOMAINS);
const preservedTypes = new Set(parseList(process.env.NAMECHEAP_PRESERVE_TYPES || "MX,TXT,CAA,SRV,NS").map((item) => item.toUpperCase()));

if (!command) {
  console.error("Usage: node scripts/namecheap-dns-manager.mjs <sync-records>");
  process.exit(1);
}

if (command !== "sync-records") {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

for (const [key, value] of Object.entries(credentials)) {
  if (!value) {
    console.error(`Missing ${toEnvName(key)}.`);
    process.exit(1);
  }
}

try {
  await syncRecords();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value.trim().toLowerCase();
}

function toEnvName(key) {
  return `NAMECHEAP_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}`;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function parseList(value) {
  if (!value) return [];
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function splitDomain(domain) {
  const normalized = domain.trim().toLowerCase();
  const parts = normalized.split(".");
  if (parts.length < 2) {
    throw new Error(`Invalid domain: ${domain}`);
  }

  return {
    sld: parts[0],
    tld: parts.slice(1).join("."),
    fqdn: normalized
  };
}

function getHostLabel(domain) {
  const normalized = domain.trim().toLowerCase();
  if (normalized === domainName) {
    return "@";
  }

  const suffix = `.${domainName}`;
  if (!normalized.endsWith(suffix)) {
    throw new Error(`Domain ${domain} is not under ${domainName}.`);
  }

  return normalized.slice(0, -suffix.length);
}

function buildManagedRecords() {
  const labels = domains.length ? domains.map(getHostLabel) : ["@", "www"];
  const uniqueLabels = [...new Set(labels)];

  return uniqueLabels.map((host) => ({
    name: host,
    type: host === "@" ? "ALIAS" : "CNAME",
    address: dnsTarget,
    ttl
  }));
}

function normalizeRecord(record) {
  return {
    name: (record.Name || "").trim() || "@",
    type: (record.Type || "").trim().toUpperCase(),
    address: (record.Address || "").trim(),
    ttl: String(record.TTL || "1800").trim(),
    mxPref: String(record.MXPref || "10").trim(),
    emailType: (record.EmailType || "").trim(),
    flag: (record.Flag || "").trim(),
    tag: (record.Tag || "").trim()
  };
}

function shouldPreserve(record, managedHosts) {
  if (!managedHosts.has(record.name)) {
    return true;
  }

  return preservedTypes.has(record.type);
}

async function syncRecords() {
  const domain = splitDomain(domainName);
  const managedRecords = buildManagedRecords();
  const managedHosts = new Set(managedRecords.map((record) => record.name));
  const { xml, records, isUsingOurDns } = await getHosts(domain);

  if (!isUsingOurDns) {
    throw new Error(
      `Namecheap DNS is not active for ${domainName}. This script only updates host records and will not switch nameservers.`
    );
  }

  const retainedRecords = records
    .map(normalizeRecord)
    .filter((record) => shouldPreserve(record, managedHosts));
  const desiredRecords = [...retainedRecords, ...managedRecords];

  assertUniqueRecordCombos(desiredRecords);

  console.log(`Loaded ${records.length} existing DNS records for ${domainName}.`);
  console.log(`Will keep ${retainedRecords.length} records and enforce ${managedRecords.length} web routing records.`);

  if (dryRun) {
    console.log("Dry run enabled. Planned DNS payload:");
    console.log(JSON.stringify(desiredRecords, null, 2));
    return;
  }

  await setHosts(domain, desiredRecords);
  console.log(`Updated Namecheap DNS for ${domainName}.`);
  void xml;
}

function assertUniqueRecordCombos(records) {
  const seen = new Set();

  for (const record of records) {
    const key = `${record.name}|${record.type}|${record.address}|${record.mxPref}|${record.flag}|${record.tag}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate DNS record generated for ${record.name} (${record.type}).`);
    }
    seen.add(key);
  }
}

async function getHosts(domain) {
  const xml = await apiRequest("namecheap.domains.dns.getHosts", {
    SLD: domain.sld,
    TLD: domain.tld
  });

  const status = getApiStatus(xml);
  if (status !== "OK") {
    throw new Error(`Namecheap getHosts failed: ${extractErrors(xml) || status}`);
  }

  const resultTag = extractTag(xml, "DomainDNSGetHostsResult");
  if (!resultTag) {
    throw new Error("Could not parse Namecheap getHosts response.");
  }

  const attrs = parseAttributes(resultTag);
  const records = extractSelfClosingTags(xml, "Host").map(parseAttributes);

  return {
    xml,
    records,
    isUsingOurDns: String(attrs.IsUsingOurDNS || "").toLowerCase() === "true"
  };
}

async function setHosts(domain, records) {
  const payload = {
    SLD: domain.sld,
    TLD: domain.tld
  };

  records.forEach((record, index) => {
    const position = String(index + 1);
    payload[`HostName${position}`] = record.name;
    payload[`RecordType${position}`] = record.type;
    payload[`Address${position}`] = record.address;
    payload[`TTL${position}`] = record.ttl;

    if (record.type === "MX") {
      payload[`MXPref${position}`] = record.mxPref || "10";
    }

    if (record.emailType) {
      payload[`EmailType${position}`] = record.emailType;
    }

    if (record.flag) {
      payload[`Flag${position}`] = record.flag;
    }

    if (record.tag) {
      payload[`Tag${position}`] = record.tag;
    }
  });

  const xml = await apiRequest("namecheap.domains.dns.setHosts", payload);
  const status = getApiStatus(xml);
  if (status !== "OK") {
    throw new Error(`Namecheap setHosts failed: ${extractErrors(xml) || status}`);
  }

  const resultTag = extractTag(xml, "DomainDNSSetHostsResult");
  if (!resultTag) {
    throw new Error("Could not parse Namecheap setHosts response.");
  }

  const attrs = parseAttributes(resultTag);
  if (String(attrs.IsSuccess || "").toLowerCase() !== "true") {
    throw new Error(`Namecheap setHosts did not confirm success for ${domain.fqdn}.`);
  }
}

async function apiRequest(commandName, payload) {
  const params = new URLSearchParams({
    ApiUser: credentials.apiUser,
    ApiKey: credentials.apiKey,
    UserName: credentials.username,
    ClientIp: credentials.clientIp,
    Command: commandName,
    ...payload
  });

  const response = await fetch("https://api.namecheap.com/xml.response", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Namecheap API request failed (${response.status} ${response.statusText}).`);
  }

  return text;
}

function getApiStatus(xml) {
  const match = xml.match(/<ApiResponse\b[^>]*\bStatus="([^"]+)"/i);
  return match ? match[1] : "";
}

function extractErrors(xml) {
  const errors = [...xml.matchAll(/<Error\b[^>]*>(.*?)<\/Error>/gis)].map((match) => decodeXml(match[1].trim())).filter(Boolean);
  return errors.join("; ");
}

function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}\\b([^>]*)>`, "i");
  const match = xml.match(regex);
  return match ? match[1] : "";
}

function extractSelfClosingTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}\\b([^>]*)\\/>`, "gi");
  return [...xml.matchAll(regex)].map((match) => match[1]);
}

function parseAttributes(raw) {
  const attributes = {};

  for (const match of raw.matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }

  return attributes;
}

function decodeXml(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
