/**
 * RedNote (XHS) pipeline: CSV → clean → download images → platforms/xhs.json → merged-data.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'
import { mergePosts, cleanPost, normalizeRow } from './lib/xhs-pipeline.mjs'
import { withSourceDisplay } from './lib/platforms.mjs'
import { mergeAllPlatformFiles } from './lib/merge-platforms.mjs'
import { downloadPostsImages, localPostImagePath } from './lib/download-post-image.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLATFORM = 'xhs'
const mediaCrawlerCsv = path.resolve(__dirname, '../../../MediaCrawler/data/xhs/csv')
const platformsDir = path.resolve(__dirname, '../data/platforms')
const platformOutPath = path.join(platformsDir, 'xhs.json')
const mergedDataPath = path.resolve(__dirname, '../data/merged-data.json')
const statsPath = path.resolve(__dirname, '../data/import-stats.json')

const DEFAULT_BATCHES = [
  { file: path.join(mediaCrawlerCsv, 'kl_search_contents_2026-05-24.csv'), label: 'kl' },
  { file: path.join(mediaCrawlerCsv, 'melaka_search_contents_merged.csv'), label: 'melaka' },
  { file: path.join(mediaCrawlerCsv, 'pahang_search_contents_2026-05-26.csv'), label: 'pahang' },
  { file: path.join(mediaCrawlerCsv, 'penang_search_contents_2026-05-24.csv'), label: 'penang' },
  { file: path.join(mediaCrawlerCsv, 'perak_search_contents_2026-05-26.csv'), label: 'perak' },
  { file: path.join(mediaCrawlerCsv, 'sabah1_search_contents_2026-06-10.csv'), label: 'sabah' },
  { file: path.join(mediaCrawlerCsv, 'sabah2_search_contents_2026-06-11.csv'), label: 'sabah' },
  { file: path.join(mediaCrawlerCsv, 'sarawak1_search_contents_2026-06-12.csv'), label: 'sarawak' },
  { file: path.join(mediaCrawlerCsv, 'sarawak2_earch_contents_2026-06-12.csv'), label: 'sarawak' },
]

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

async function main() {
  const cliFiles = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((p) => path.resolve(p))
  const skipImages = process.argv.includes('--skip-images')
  const batches =
    cliFiles.length > 0
      ? cliFiles.map((file, i) => ({ file, label: `batch-${i + 1}` }))
      : DEFAULT_BATCHES

  const existingLocals = loadExistingImageLocals()
  const batchReports = []
  const allKept = []

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
    console.log('\nDownloading post cover images (RedNote CDN)…')
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
  console.log(`\nRedNote (${PLATFORM}): ${allKept.length} → ${platformMerged.length} unique`)
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
  console.log('\nNext: npm run seed:mongodb')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
