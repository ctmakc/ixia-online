import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('/home/llm/.local/npm-global/lib/node_modules/wrangler/package.json')
const { hash: blake3Hash } = require('blake3-wasm')
const mime = require('mime')

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'f50028dd4cf34f44f4ce84b6d9b8f476'
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const PROJECT_NAME = process.env.CF_PAGES_PROJECT || process.env.CLOUDFLARE_PAGES_PROJECT || 'ixia-online'
const BRANCH = process.env.CF_PAGES_BRANCH || 'main'
const DIST_DIR = path.resolve(process.argv[2] || 'dist')
const API_BASE = 'https://api.cloudflare.com/client/v4'

if (!API_TOKEN) {
  throw new Error('CLOUDFLARE_API_TOKEN is required')
}

async function cfJson(url, init = {}, token = API_TOKEN) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers || {}),
    },
  })

  const data = await response.json()

  if (!response.ok || data.success === false) {
    throw new Error(`Cloudflare API error for ${url}: ${JSON.stringify(data.errors || data)}`)
  }

  return data.result
}

async function walk(dir, base = dir, files = new Map()) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    const rel = path.relative(base, abs).split(path.sep).join('/')

    if (entry.isDirectory()) {
      await walk(abs, base, files)
      continue
    }

    if (entry.isSymbolicLink()) {
      continue
    }

    const raw = await fs.readFile(abs)
    const ext = path.extname(abs).slice(1)
    const base64 = raw.toString('base64')
    const hash = blake3Hash(base64 + ext).toString('hex').slice(0, 32)

    files.set(rel, {
      path: abs,
      hash,
      base64,
      sizeInBytes: raw.byteLength,
      contentType: mime.getType(rel) || 'application/octet-stream',
    })
  }

  return files
}

async function ensureProject() {
  try {
    return await cfJson(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}`)
  } catch {
    return await cfJson(`/accounts/${ACCOUNT_ID}/pages/projects`, {
      method: 'POST',
      body: JSON.stringify({
        name: PROJECT_NAME,
        production_branch: BRANCH,
      }),
    })
  }
}

async function uploadAssets(files) {
  const jwtPayload = await cfJson(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/upload-token`)
  let jwt = jwtPayload.jwt
  const allFiles = [...files.values()]
  const hashes = allFiles.map((file) => file.hash)

  const missing = await cfJson(
    '/pages/assets/check-missing',
    {
      method: 'POST',
      body: JSON.stringify({ hashes }),
    },
    jwt,
  )

  const missingFiles = allFiles.filter((file) => missing.includes(file.hash))
  const buckets = []
  let current = []
  let currentBytes = 0

  for (const file of missingFiles.sort((a, b) => b.sizeInBytes - a.sizeInBytes)) {
    if (current.length >= 50 || currentBytes + file.sizeInBytes > 25 * 1024 * 1024) {
      buckets.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += file.sizeInBytes
  }

  if (current.length) {
    buckets.push(current)
  }

  for (const bucket of buckets) {
    const payload = bucket.map((file) => ({
      key: file.hash,
      value: file.base64,
      metadata: { contentType: file.contentType },
      base64: true,
    }))

    await cfJson(
      '/pages/assets/upload',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      jwt,
    )
  }

  await cfJson(
    '/pages/assets/upsert-hashes',
    {
      method: 'POST',
      body: JSON.stringify({ hashes }),
    },
    jwt,
  )

  return Object.fromEntries([...files.entries()].map(([name, file]) => [`/${name}`, file.hash]))
}

async function createDeployment(manifest) {
  const formData = new FormData()
  formData.append('manifest', JSON.stringify(manifest))
  formData.append('branch', BRANCH)
  formData.append('commit_dirty', 'true')
  formData.append('commit_message', 'Direct upload deploy from local workspace')

  return await cfJson(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`, {
    method: 'POST',
    body: formData,
  })
}

async function pollDeployment(id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const deployment = await cfJson(
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments/${id}`,
    )

    const stage = deployment.latest_stage
    console.log(`stage=${stage?.name} status=${stage?.status}`)

    if (stage?.status === 'success') {
      return deployment
    }

    if (stage?.status === 'failure') {
      throw new Error(`Deployment failed at stage ${stage?.name}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  throw new Error('Timed out waiting for deployment')
}

async function main() {
  await ensureProject()
  const files = await walk(DIST_DIR)
  console.log(`files=${files.size}`)
  const manifest = await uploadAssets(files)
  const deployment = await createDeployment(manifest)
  console.log(`deployment_id=${deployment.id}`)
  const finalDeployment = await pollDeployment(deployment.id)
  console.log(`url=https://${finalDeployment.url}`)
  if (finalDeployment.aliases?.length) {
    console.log(`aliases=${finalDeployment.aliases.join(',')}`)
  }
}

await main()
