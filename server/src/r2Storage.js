import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { defaultProvider } from '@aws-sdk/credential-provider-node'

function resolveR2Endpoint() {
  const fromEnv = (process.env.R2_ENDPOINT_URL || '').replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const accountId = process.env.R2_ACCOUNT_ID
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`

  return null
}

function r2Credentials() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return null
  return { accessKeyId, secretAccessKey }
}

export function isR2Configured() {
  return Boolean(resolveR2Endpoint() && process.env.R2_BUCKET)
}

let client = null

function getR2Client() {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured')
  }
  if (!client) {
    const explicit = r2Credentials()
    client = new S3Client({
      region: 'auto',
      endpoint: resolveR2Endpoint(),
      credentials: explicit || defaultProvider(),
    })
  }
  return client
}

export async function putR2Object(key, body, contentType) {
  const bucket = process.env.R2_BUCKET
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key.replace(/^\/+/, ''),
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function deleteR2Object(key) {
  const bucket = process.env.R2_BUCKET
  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key.replace(/^\/+/, ''),
      }),
    )
  } catch {
    // Object may not exist — ignore delete failures.
  }
}
