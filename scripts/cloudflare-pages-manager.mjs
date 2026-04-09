import process from "node:process";

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || process.env.npm_package_name || "buzztm";
const productionBranch = process.env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH || "main";
const buildCommand = process.env.CLOUDFLARE_PAGES_BUILD_COMMAND || "npm run build";
const buildOutputDir = process.env.CLOUDFLARE_PAGES_BUILD_OUTPUT_DIR || "dist";
const domains = parseList(process.env.CLOUDFLARE_PAGES_DOMAINS);
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const dnsTarget = process.env.CLOUDFLARE_DNS_TARGET || `${projectName}.pages.dev`;
const dnsProxied = parseBoolean(process.env.CLOUDFLARE_DNS_PROXIED, true);

const command = process.argv[2];

if (!command) {
  console.error("Usage: node scripts/cloudflare-pages-manager.mjs <ensure-project|sync-domains>");
  process.exit(1);
}

if (!apiToken || !accountId) {
  console.error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID.");
  process.exit(1);
}

try {
  if (command === "ensure-project") {
    await ensureProject();
  } else if (command === "sync-domains") {
    await syncDomains();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseList(value) {
  if (!value) return [];
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok || payload.success === false) {
    const details = Array.isArray(payload?.errors) && payload.errors.length
      ? payload.errors.map((item) => item.message || JSON.stringify(item)).join("; ")
      : `${response.status} ${response.statusText}`;
    const error = new Error(`Cloudflare API request failed for ${method} ${path}: ${details}`);
    error.status = response.status;
    throw error;
  }

  return payload.result;
}

async function getProject() {
  try {
    return await apiRequest(`/accounts/${accountId}/pages/projects/${projectName}`);
  } catch (error) {
    if (error && typeof error === "object" && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function ensureProject() {
  const desiredConfig = {
    production_branch: productionBranch,
    build_config: {
      build_command: buildCommand,
      destination_dir: buildOutputDir
    }
  };

  const existing = await getProject();

  if (!existing) {
    await apiRequest(`/accounts/${accountId}/pages/projects`, {
      method: "POST",
      body: {
        name: projectName,
        ...desiredConfig
      }
    });
    console.log(`Created Pages project ${projectName}.`);
    return;
  }

  const existingBuildConfig = existing.build_config || {};
  const needsUpdate =
    existing.production_branch !== desiredConfig.production_branch ||
    existingBuildConfig.build_command !== desiredConfig.build_config.build_command ||
    existingBuildConfig.destination_dir !== desiredConfig.build_config.destination_dir;

  if (!needsUpdate) {
    console.log(`Pages project ${projectName} already matches desired config.`);
    return;
  }

  await apiRequest(`/accounts/${accountId}/pages/projects/${projectName}`, {
    method: "PATCH",
    body: desiredConfig
  });
  console.log(`Updated Pages project ${projectName}.`);
}

async function syncDomains() {
  if (!domains.length) {
    console.log("CLOUDFLARE_PAGES_DOMAINS is empty, nothing to sync.");
    return;
  }

  const existingDomains = await apiRequest(`/accounts/${accountId}/pages/projects/${projectName}/domains`);
  const domainMap = new Map(existingDomains.map((item) => [item.name, item]));

  for (const domain of domains) {
    let domainInfo = domainMap.get(domain);

    if (!domainInfo) {
      domainInfo = await apiRequest(`/accounts/${accountId}/pages/projects/${projectName}/domains`, {
        method: "POST",
        body: { name: domain }
      });
      console.log(`Attached domain ${domain} to Pages project ${projectName}.`);
    } else {
      console.log(`Domain ${domain} already attached with status ${domainInfo.status || "unknown"}.`);
    }

    if (zoneId) {
      await upsertDnsRecord(domain);
    }

    if (domainInfo.status && domainInfo.status !== "active") {
      await apiRequest(`/accounts/${accountId}/pages/projects/${projectName}/domains/${encodeURIComponent(domain)}`, {
        method: "PATCH"
      });
      console.log(`Requested validation refresh for ${domain}.`);
    }
  }
}

async function upsertDnsRecord(domain) {
  const params = new URLSearchParams({
    type: "CNAME",
    name: domain
  });

  const existingRecords = await apiRequest(`/zones/${zoneId}/dns_records?${params.toString()}`);
  const recordBody = {
    type: "CNAME",
    name: domain,
    content: dnsTarget,
    proxied: dnsProxied,
    ttl: 1
  };

  if (!existingRecords.length) {
    await apiRequest(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: recordBody
    });
    console.log(`Created DNS record ${domain} -> ${dnsTarget}.`);
    return;
  }

  const [record] = existingRecords;
  const needsUpdate =
    record.content !== recordBody.content ||
    Boolean(record.proxied) !== recordBody.proxied ||
    Number(record.ttl) !== recordBody.ttl;

  if (!needsUpdate) {
    console.log(`DNS record ${domain} already points to ${dnsTarget}.`);
    return;
  }

  await apiRequest(`/zones/${zoneId}/dns_records/${record.id}`, {
    method: "PUT",
    body: recordBody
  });
  console.log(`Updated DNS record ${domain} -> ${dnsTarget}.`);
}
