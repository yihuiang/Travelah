/**
 * Douyin (TikTok CN) pipeline: MediaCrawler CSV → clean → platforms/dy.json → merged-data.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'
import { mergePosts, cleanPost, normalizeRow } from './lib/dy-pipeline.mjs'
import { withSourceDisplay } from './lib/platforms.mjs'
import { mergeAllPlatformFiles } from './lib/merge-platforms.mjs'
import { downloadPostsImages, localPostImagePath } from './lib/download-post-image.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLATFORM = 'dy'
const douyinCsvDir = path.resolve(__dirname, '../../../MediaCrawler/data/douyin/csv')
const platformsDir = path.resolve(__dirname, '../data/platforms')
const platformOutPath = path.join(platformsDir, 'dy.json')
const mergedDataPath = path.resolve(__dirname, '../data/merged-data.json')
const statsPath = path.resolve(__dirname, '../data/import-stats-dy.json')

const DEFAULT_BATCHES = [{ file: path.join(douyinCsvDir, 'ipoh_merged.csv'), label: 'ipoh' }]

function inferBatchLabel(filePath) {
  const base = path.basename(filePath).toLowerCase()
  if (base.includes('ipoh')) return 'ipoh'
  if (base.includes('penang')) return 'penang'
  if (base.includes('kl') || base.includes('kuala')) return 'kl'
  if (base.includes('melaka') || base.includes('malacca')) return 'melaka'
  if (base.includes('johor')) return 'johor'
  if (base.includes('sabah')) return 'sabah'
  if (base.includes('sarawak')) return 'sarawak'
  if (base.includes('perak')) return 'perak'
  if (base.includes('selangor')) return 'selangor'
  if (base.includes('terengganu')) return 'terengganu'
  if (base.includes('kedah')) return 'kedah'
  if (base.includes('kelantan')) return 'kelantan'
  if (base.includes('pahang')) return 'pahang'
  if (base.includes('perlis')) return 'perlis'
  if (base.includes('putrajaya')) return 'putrajaya'
  if (base.includes('labuan')) return 'labuan'
  if (base.includes('negeri') || base.includes('sembilan')) return 'negeri sembilan'
  return null
}

function loadCsv(filePath, batchLabel) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV not found: ${filePath}`)
  }
  const rows = parse(fs.readFileSync(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  })
  return rows.map((row, index) => normalizeRow(row, index, { batchLabel }))
}

function runBatch(filePath, batchLabel) {
  const normalized = loadCsv(filePath, batchLabel)
  const kept = []
  const dropped = {}

  for (const post of normalized) {
    const result = cleanPost(post)
    if (result.ok) {
      kept.push(withSourceDisplay(post))
    } else {
      dropped[result.reason] = (dropped[result.reason] || 0) + 1
    }
  }

  return { batchLabel, filePath, raw: normalized.length, kept, dropped }
}

function loadExistingImageLocals() {
  if (!fs.existsSync(mergedDataPath)) return new Map()
  try {
    const posts = JSON.parse(fs.readFileSync(mergedDataPath, 'utf8'))
    const map = new Map()
    for (const post of posts) {
      const local = post.imageLocal || localPostImagePath(post.id)
      if (local) map.set(post.id, local)
    }
    return map
  } catch {
    return new Map()
  }
}

function loadExistingPlatformPosts() {
  if (!fs.existsSync(platformOutPath)) return []
  try {
    return JSON.parse(fs.readFileSync(platformOutPath, 'utf8'))
  } catch {
    return []
  }
}

async function main() {
  const cliFiles = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((p) => path.resolve(p))
  const skipImages = process.argv.includes('--skip-images')
  const batches =
    cliFiles.length > 0
      ? cliFiles.map((file, i) => ({
          file,
          label: inferBatchLabel(file) || `batch-${i + 1}`,
        }))
      : DEFAULT_BATCHES

  const existingLocals = loadExistingImageLocals()
  const existingPlatform = loadExistingPlatformPosts()
  const batchReports = []
  const allKept = [...existingPlatform]

  for (const { file, label } of batches) {
    const report = runBatch(file, label)
    batchReports.push(report)
    allKept.push(...report.kept)
    console.log(
      `[${label}] ${path.basename(file)}: ${report.raw} rows → ${report.kept.length} kept`,
    )
    if (Object.keys(report.dropped).length) {
      console.log(`  dropped:`, report.dropped)
    }
  }

  let platformMerged = mergePosts(allKept)
  for (const post of platformMerged) {
    const local = existingLocals.get(post.id) || localPostImagePath(post.id)
    if (local) post.imageLocal = local
  }

  if (!skipImages) {
    console.log('\nDownloading post cover images (Douyin CDN)…')
    const imageStats = await downloadPostsImages(
      platformMerged.filter((p) => !p.imageLocal),
      {
        delayMs: 100,
        onProgress: ({ done, total, saved, failed }) => {
          if (done % 50 === 0 || done === total) {
            console.log(`  images ${done}/${total} — saved ${saved}, failed ${failed}`)
          }
        },
      },
    )
    console.log(
      `Images: saved ${imageStats.saved}, failed ${imageStats.failed}, skipped ${imageStats.skipped}`,
    )
  }

  const duplicateInBatches = allKept.length - platformMerged.length

  fs.mkdirSync(platformsDir, { recursive: true })
  fs.writeFileSync(platformOutPath, JSON.stringify(platformMerged, null, 2), 'utf8')
  console.log(`\nDouyin (${PLATFORM}): ${allKept.length} → ${platformMerged.length} unique`)
  console.log(`Wrote ${platformOutPath}`)

  const mergedData = mergeAllPlatformFiles(platformsDir)
  fs.writeFileSync(mergedDataPath, JSON.stringify(mergedData, null, 2), 'utf8')
  console.log(`Combined feed: ${mergedData.length} posts from all platforms → ${mergedDataPath}`)

  const stats = {
    importedAt: new Date().toISOString(),
    platform: PLATFORM,
    batches: batchReports,
    totalAfterClean: allKept.length,
    duplicatesRemovedInPlatform: duplicateInBatches,
    platformCount: platformMerged.length,
    combinedTrendingCount: mergedData.length,
    withLocalImages: mergedData.filter((p) => p.imageLocal).length,
    platformFiles: fs.readdirSync(platformsDir).filter((f) => f.endsWith('.json')),
  }
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8')
  console.log(`Stats ${statsPath}`)
  console.log('\nNext: npm run seed:mongodb && python nlp/extract_places.py && npm run seed:places')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
