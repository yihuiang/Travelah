/** Shared helpers for Explore grid pagination in maintenance scripts. */

export const DEFAULT_PAGE_SIZE = 9

export function parseExploreArgs(argv = process.argv) {
  const pageArg = argv.find((a) => a.startsWith('--page='))
  const pageSizeArg = argv.find((a) => a.startsWith('--page-size='))
  const idsArg = argv.find((a) => a.startsWith('--ids='))

  return {
    page: pageArg ? parseInt(pageArg.split('=')[1], 10) : 0,
    pageSize: pageSizeArg ? parseInt(pageSizeArg.split('=')[1], 10) : DEFAULT_PAGE_SIZE,
    ids: idsArg
      ? idsArg
          .split('=')[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  }
}

export function sliceExplorePage(places, { page, pageSize }) {
  if (!page || page < 1) return places
  const start = (page - 1) * pageSize
  return places.slice(start, start + pageSize)
}

export function filterByIds(places, ids) {
  if (!ids.length) return places
  const set = new Set(ids)
  return places.filter((p) => set.has(p._id))
}
