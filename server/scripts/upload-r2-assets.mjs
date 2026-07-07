/**
 * Sync local public assets to Cloudflare R2 via AWS CLI.
 * Requires: aws configure (R2 access key) and R2_ACCOUNT_ID + R2_BUCKET in server/.env
 *
 * Usage:
 *   node scripts/upload-r2-assets.mjs heritage   # client/public/images → s3://bucket/images/
 *   node scripts/upload-r2-assets.mjs posts      # client/public/posts   → s3://bucket/posts/
 *   node scripts/upload-r2-assets.mjs places     # client/public/places  → s3://bucket/places/
 *   node scripts/upload-r2-assets.mjs all
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

dotenv.config({ path: path.join(__dirname, '../.env') })

const BUCKET = process.env.R2_BUCKET || 'travelah-posts'

const WIN_AWS_EXE = 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe'

function resolveR2Endpoint() {
  const fromEnv = (process.env.R2_ENDPOINT_URL || '').replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const accountId = process.env.R2_ACCOUNT_ID
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`

  return null
}

function resolveAwsExecutable() {
  if (process.env.AWS_CLI_PATH && existsSync(process.env.AWS_CLI_PATH)) {
    return process.env.AWS_CLI_PATH
  }
  if (process.platform === 'win32' && existsSync(WIN_AWS_EXE)) {
    return WIN_AWS_EXE
  }
  return 'aws'
}

function runAws(args) {
  const exe = resolveAwsExecutable()
  const extra = process.env.R2_AWS_NO_VERIFY_SSL === '1' ? ['--no-verify-ssl'] : []
  return spawnSync(exe, [...args, ...extra], { encoding: 'utf8' })
}

const TARGETS = {
  heritage: {
    local: path.join(root, 'client/public/images'),
    remote: 'images/',
  },
  posts: {
    local: path.join(root, 'client/public/posts'),
    remote: 'posts/',
  },
  places: {
    local: path.join(root, 'client/public/places'),
    remote: 'places/',
  },
}

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

if (!resolveR2Endpoint()) {
  fail('Set R2_ENDPOINT_URL (or R2_ACCOUNT_ID) in server/.env — copy from R2 bucket Settings → S3 API.')
}

const endpoint = resolveR2Endpoint()
const targetArg = (process.argv[2] || 'heritage').toLowerCase()
const keys =
  targetArg === 'all' ? Object.keys(TARGETS) : targetArg in TARGETS ? [targetArg] : null

if (!keys) {
  fail(`Unknown target "${targetArg}". Use: heritage | posts | places | all`)
}

for (const key of keys) {
  const { local, remote } = TARGETS[key]
  if (!existsSync(local)) {
    console.warn(`⚠ Skipping ${key}: folder not found (${local})`)
    continue
  }

  const dest = `s3://${BUCKET}/${remote}`
  console.log(`\n→ Sync ${key}: ${local}`)
  console.log(`  → ${dest}`)
  console.log(`  endpoint: ${endpoint}`)
  console.log(`  aws: ${resolveAwsExecutable()}\n`)

  const result = runAws(['s3', 'sync', local, dest, '--endpoint-url', endpoint])

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.error) {
    fail(`Could not run AWS CLI: ${result.error.message}`)
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    fail(
      `aws s3 sync failed for ${key} (exit ${result.status})${
        detail ? `\n${detail}` : ''
      }`,
    )
  }
}

console.log('\n✓ Upload complete.')
console.log('Set VITE_R2_PUBLIC_URL in client/.env to your bucket public r2.dev URL, then restart Vite.')
