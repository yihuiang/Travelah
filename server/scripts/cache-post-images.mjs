/**
 * Download RedNote post cover images to client/public/posts/{postId}.webp
 * Run after import while CDN URLs are still valid, or to backfill existing data.
 *
 * Usage: npm run cache:post-images
 *        npm run cache:post-images -- --limit 50
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { downloadPostsImages } from './lib/download-post-image.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mergedDataPath = path.resolve(__dirname, '../data/merged-data.json')
const platformPath = path.resolve(__dirname, '../data/platforms/xhs.json')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0

  if (!fs.existsSync(mergedDataPath)) {
    throw new Error(`Missing ${mergedDataPath}. Run npm run import:trending first.`)
  }

  const posts = readJson(mergedDataPath)
  const slice = limit > 0 ? posts.slice(0, limit) : posts

  console.log(`Caching images for ${slice.length} posts…`)
  const stats = await downloadPostsImages(slice, {
    onProgress: ({ done, total, saved, failed }) => {
      console.log(`  ${done}/${total} — saved ${saved}, failed ${failed}`)
    },
  })

  const byId = new Map(slice.filter((p) => p.imageLocal).map((p) => [p.id, p.imageLocal]))
  for (const post of posts) {
    const local = byId.get(post.id)
    if (local) post.imageLocal = local
  }

  fs.writeFileSync(mergedDataPath, JSON.stringify(posts, null, 2), 'utf8')
  if (fs.existsSync(platformPath)) {
    const platform = readJson(platformPath)
    for (const post of platform) {
      const local = byId.get(post.id)
      if (local) post.imageLocal = local
    }
    fs.writeFileSync(platformPath, JSON.stringify(platform, null, 2), 'utf8')
  }

  console.log(`Done — saved ${stats.saved}, failed ${stats.failed}, skipped ${stats.skipped}`)
  console.log('Next: npm run seed:mongodb')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
