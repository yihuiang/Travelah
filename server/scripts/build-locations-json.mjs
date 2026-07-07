/**
 * Regenerate server/data/locations.json — official states, federal territories & cities.
 * Run: npm run build:locations
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(__dirname, '../data/locations.json')

function regionEntry(id, name, opts = {}) {
  const dataState = opts.dataState || name
  const entry = {
    _id: id,
    name,
    type: opts.federal ? 'federal_territory' : 'state',
    subType: opts.federal ? 'federal_territory' : 'state',
    parentId: null,
    state: name,
    dataState,
    aliases: opts.aliases || [],
    matchRules: { state: dataState },
    minPlaces: opts.minPlaces ?? 3,
    sortOrder: opts.sortOrder ?? 99,
    featured: Boolean(opts.featured),
    recommended: Boolean(opts.recommended),
    active: true,
  }
  if (opts.recommendOrder != null) entry.recommendOrder = opts.recommendOrder
  return entry
}

function cityEntry(id, name, parentId, regionName, dataState, opts = {}) {
  const terms = opts.terms || [name.toLowerCase()]
  const descTerms = opts.descriptionContains || terms
  const entry = {
    _id: id,
    name,
    type: 'subdestination',
    subType: 'city',
    parentId,
    state: regionName,
    dataState,
    aliases: opts.aliases || terms,
    matchRules: {
      requireState: dataState,
      nameContains: terms,
      descriptionContains: descTerms,
    },
    minPlaces: opts.minPlaces ?? 1,
    sortOrder: opts.sortOrder ?? 99,
    featured: Boolean(opts.featured),
    recommended: Boolean(opts.recommended),
    active: true,
  }
  if (opts.recommendOrder != null) entry.recommendOrder = opts.recommendOrder
  return entry
}

const locations = [
  // ── Johor ─────────────────────────────────────────────────────────────
  regionEntry('johor', 'Johor', {
    aliases: ['johor', '柔佛'],
    sortOrder: 1,
    recommended: true,
    recommendOrder: 8,
  }),
  cityEntry('johor-jb', 'Johor Bahru', 'johor', 'Johor', 'Johor', {
    sortOrder: 1,
    terms: ['johor bahru', '新山', 'jb'],
    descriptionContains: ['johor bahru', '新山', 'jb ', 'jalan dhoby'],
  }),
  cityEntry('johor-iskandar', 'Iskandar Puteri', 'johor', 'Johor', 'Johor', {
    sortOrder: 2,
    terms: ['iskandar puteri', 'nusajaya', '依斯干达'],
  }),
  cityEntry('johor-muar', 'Muar', 'johor', 'Johor', 'Johor', {
    sortOrder: 3,
    terms: ['muar', '麻坡'],
  }),
  cityEntry('johor-batu-pahat', 'Batu Pahat', 'johor', 'Johor', 'Johor', {
    sortOrder: 4,
    terms: ['batu pahat', '峇株巴辖'],
  }),
  cityEntry('johor-kluang', 'Kluang', 'johor', 'Johor', 'Johor', {
    sortOrder: 5,
    terms: ['kluang', '居銮'],
  }),
  cityEntry('johor-pasir-gudang', 'Pasir Gudang', 'johor', 'Johor', 'Johor', {
    sortOrder: 6,
    terms: ['pasir gudang', '巴西古当'],
  }),
  cityEntry('johor-kulai', 'Kulai', 'johor', 'Johor', 'Johor', {
    sortOrder: 7,
    terms: ['kulai', '古来'],
  }),
  cityEntry('johor-pontian', 'Pontian', 'johor', 'Johor', 'Johor', {
    sortOrder: 8,
    terms: ['pontian', '笨珍'],
  }),
  cityEntry('johor-segamat', 'Segamat', 'johor', 'Johor', 'Johor', {
    sortOrder: 9,
    terms: ['segamat', '昔加末'],
  }),

  // ── Kedah ─────────────────────────────────────────────────────────────
  regionEntry('kedah', 'Kedah', {
    aliases: ['kedah', '吉打'],
    sortOrder: 2,
    recommended: true,
    recommendOrder: 9,
  }),
  cityEntry('kedah-alor-setar', 'Alor Setar', 'kedah', 'Kedah', 'Kedah', {
    sortOrder: 1,
    terms: ['alor setar', '亚罗士打', 'alor star'],
  }),
  cityEntry('kedah-sungai-petani', 'Sungai Petani', 'kedah', 'Kedah', 'Kedah', {
    sortOrder: 2,
    terms: ['sungai petani', '双溪大年'],
  }),
  cityEntry('kedah-kulim', 'Kulim', 'kedah', 'Kedah', 'Kedah', {
    sortOrder: 3,
    terms: ['kulim', '居林'],
  }),
  cityEntry('kedah-langkawi', 'Langkawi', 'kedah', 'Kedah', 'Kedah', {
    sortOrder: 4,
    featured: true,
    recommended: true,
    recommendOrder: 3,
    terms: ['langkawi', '兰卡威', 'pulau langkawi'],
  }),
  cityEntry('kedah-jitra', 'Jitra', 'kedah', 'Kedah', 'Kedah', {
    sortOrder: 5,
    terms: ['jitra', '日得拉'],
  }),

  // ── Kelantan ──────────────────────────────────────────────────────────
  regionEntry('kelantan', 'Kelantan', {
    aliases: ['kelantan', '吉兰丹'],
    sortOrder: 3,
    minPlaces: 1,
  }),
  cityEntry('kelantan-kota-bharu', 'Kota Bharu', 'kelantan', 'Kelantan', 'Kelantan', {
    sortOrder: 1,
    terms: ['kota bharu', '哥打巴鲁', 'kotabharu'],
  }),
  cityEntry('kelantan-pasir-mas', 'Pasir Mas', 'kelantan', 'Kelantan', 'Kelantan', {
    sortOrder: 2,
    terms: ['pasir mas', '巴西马'],
  }),
  cityEntry('kelantan-tanah-merah', 'Tanah Merah', 'kelantan', 'Kelantan', 'Kelantan', {
    sortOrder: 3,
    terms: ['tanah merah', '丹那美拉'],
  }),
  cityEntry('kelantan-gua-musang', 'Gua Musang', 'kelantan', 'Kelantan', 'Kelantan', {
    sortOrder: 4,
    terms: ['gua musang', '话望生'],
  }),
  cityEntry('kelantan-tumpat', 'Tumpat', 'kelantan', 'Kelantan', 'Kelantan', {
    sortOrder: 5,
    terms: ['tumpat', '道北'],
  }),

  // ── Melaka ────────────────────────────────────────────────────────────
  regionEntry('melaka', 'Melaka', {
    aliases: ['melaka', 'malacca', '马六甲'],
    sortOrder: 4,
    recommended: true,
    recommendOrder: 7,
  }),
  cityEntry('melaka-city', 'Melaka City', 'melaka', 'Melaka', 'Melaka', {
    sortOrder: 1,
    terms: ['melaka city', '马六甲市', 'melaka town', 'jonker', '鸡场街'],
    descriptionContains: ['melaka', 'malacca', '马六甲', 'jonker', '鸡场街'],
  }),
  cityEntry('melaka-alor-gajah', 'Alor Gajah', 'melaka', 'Melaka', 'Melaka', {
    sortOrder: 2,
    terms: ['alor gajah', '亚罗牙也'],
  }),
  cityEntry('melaka-jasin', 'Jasin', 'melaka', 'Melaka', 'Melaka', {
    sortOrder: 3,
    terms: ['jasin', '野新'],
  }),

  // ── Negeri Sembilan ───────────────────────────────────────────────────
  regionEntry('negeri-sembilan', 'Negeri Sembilan', {
    aliases: ['negeri sembilan', '森美兰'],
    sortOrder: 5,
    minPlaces: 1,
  }),
  cityEntry('ns-seremban', 'Seremban', 'negeri-sembilan', 'Negeri Sembilan', 'Negeri Sembilan', {
    sortOrder: 1,
    terms: ['seremban', '芙蓉'],
  }),
  cityEntry('ns-port-dickson', 'Port Dickson', 'negeri-sembilan', 'Negeri Sembilan', 'Negeri Sembilan', {
    sortOrder: 2,
    terms: ['port dickson', 'pd', '波德申'],
  }),
  cityEntry('ns-nilai', 'Nilai', 'negeri-sembilan', 'Negeri Sembilan', 'Negeri Sembilan', {
    sortOrder: 3,
    terms: ['nilai', '汝来'],
  }),
  cityEntry('ns-bahau', 'Bahau', 'negeri-sembilan', 'Negeri Sembilan', 'Negeri Sembilan', {
    sortOrder: 4,
    terms: ['bahau', '马口'],
  }),
  cityEntry('ns-tampin', 'Tampin', 'negeri-sembilan', 'Negeri Sembilan', 'Negeri Sembilan', {
    sortOrder: 5,
    terms: ['tampin', '淡边'],
  }),

  // ── Pahang ────────────────────────────────────────────────────────────
  regionEntry('pahang', 'Pahang', {
    aliases: ['pahang', '彭亨'],
    sortOrder: 6,
  }),
  cityEntry('pahang-kuantan', 'Kuantan', 'pahang', 'Pahang', 'Pahang', {
    sortOrder: 1,
    terms: ['kuantan', '关丹'],
  }),
  cityEntry('pahang-temerloh', 'Temerloh', 'pahang', 'Pahang', 'Pahang', {
    sortOrder: 2,
    terms: ['temerloh', '淡马鲁'],
  }),
  cityEntry('pahang-bentong', 'Bentong', 'pahang', 'Pahang', 'Pahang', {
    sortOrder: 3,
    terms: ['bentong', '文冬'],
  }),
  cityEntry('pahang-raub', 'Raub', 'pahang', 'Pahang', 'Pahang', {
    sortOrder: 4,
    terms: ['raub', '劳勿'],
  }),
  cityEntry('pahang-pekan', 'Pekan', 'pahang', 'Pahang', 'Pahang', {
    sortOrder: 5,
    terms: ['pekan', '北根'],
  }),
  cityEntry('pahang-cameron', 'Cameron Highlands', 'pahang', 'Pahang', 'Pahang', {
    sortOrder: 6,
    featured: true,
    recommended: true,
    recommendOrder: 6,
    terms: ['cameron highlands', 'cameron', '金马伦', 'brinchang', 'tanah rata'],
    descriptionContains: ['cameron highlands', 'cameron', '金马伦'],
  }),

  // ── Penang ────────────────────────────────────────────────────────────
  regionEntry('pulau-pinang', 'Penang', {
    dataState: 'Penang',
    aliases: ['pulau pinang', 'penang', '槟城'],
    sortOrder: 7,
    featured: true,
    recommended: true,
    recommendOrder: 1,
  }),
  cityEntry('penang-george-town', 'George Town', 'pulau-pinang', 'Penang', 'Penang', {
    sortOrder: 1,
    terms: ['george town', 'georgetown', '乔治市'],
    descriptionContains: ['george town', 'georgetown', '乔治市', 'love lane', 'armenian'],
  }),
  cityEntry('penang-butterworth', 'Butterworth', 'pulau-pinang', 'Penang', 'Penang', {
    sortOrder: 2,
    terms: ['butterworth', '北海'],
    descriptionContains: ['butterworth', '北海', 'penang sentral'],
  }),
  cityEntry('penang-bukit-mertajam', 'Bukit Mertajam', 'pulau-pinang', 'Penang', 'Penang', {
    sortOrder: 3,
    terms: ['bukit mertajam', '大山脚'],
  }),
  cityEntry('penang-bayan-lepas', 'Bayan Lepas', 'pulau-pinang', 'Penang', 'Penang', {
    sortOrder: 4,
    terms: ['bayan lepas', '峇六拜'],
  }),
  cityEntry('penang-nibong-tebal', 'Nibong Tebal', 'pulau-pinang', 'Penang', 'Penang', {
    sortOrder: 5,
    terms: ['nibong tebal', '高渊'],
  }),

  // ── Perak ─────────────────────────────────────────────────────────────
  regionEntry('perak', 'Perak', {
    aliases: ['perak', '霹雳'],
    sortOrder: 8,
    recommended: true,
    recommendOrder: 11,
  }),
  cityEntry('perak-ipoh', 'Ipoh', 'perak', 'Perak', 'Perak', {
    sortOrder: 1,
    terms: ['ipoh', '怡保', 'old town ipoh', 'concubine lane'],
  }),
  cityEntry('perak-taiping', 'Taiping', 'perak', 'Perak', 'Perak', {
    sortOrder: 2,
    terms: ['taiping', '太平', 'maxwell hill'],
  }),
  cityEntry('perak-teluk-intan', 'Teluk Intan', 'perak', 'Perak', 'Perak', {
    sortOrder: 3,
    terms: ['teluk intan', '安顺'],
  }),
  cityEntry('perak-sitiawan', 'Sitiawan', 'perak', 'Perak', 'Perak', {
    sortOrder: 4,
    terms: ['sitiawan', '实兆远'],
  }),
  cityEntry('perak-lumut', 'Lumut', 'perak', 'Perak', 'Perak', {
    sortOrder: 5,
    terms: ['lumut', '红土坎'],
  }),
  cityEntry('perak-kampar', 'Kampar', 'perak', 'Perak', 'Perak', {
    sortOrder: 6,
    terms: ['kampar', 'kamp', '金宝'],
  }),
  cityEntry('perak-batu-gajah', 'Batu Gajah', 'perak', 'Perak', 'Perak', {
    sortOrder: 7,
    terms: ['batu gajah', '华都牙也'],
  }),

  // ── Perlis ────────────────────────────────────────────────────────────
  regionEntry('perlis', 'Perlis', {
    aliases: ['perlis', '玻璃市'],
    sortOrder: 9,
    minPlaces: 1,
  }),
  cityEntry('perlis-kangar', 'Kangar', 'perlis', 'Perlis', 'Perlis', {
    sortOrder: 1,
    terms: ['kangar', '加央'],
  }),
  cityEntry('perlis-arau', 'Arau', 'perlis', 'Perlis', 'Perlis', {
    sortOrder: 2,
    terms: ['arau', '亚娄'],
  }),
  cityEntry('perlis-padang-besar', 'Padang Besar', 'perlis', 'Perlis', 'Perlis', {
    sortOrder: 3,
    terms: ['padang besar', '巴东勿刹'],
  }),

  // ── Sabah ─────────────────────────────────────────────────────────────
  regionEntry('sabah', 'Sabah', {
    aliases: ['sabah', '沙巴'],
    sortOrder: 10,
    recommended: true,
    recommendOrder: 5,
  }),
  cityEntry('sabah-kota-kinabalu', 'Kota Kinabalu', 'sabah', 'Sabah', 'Sabah', {
    sortOrder: 1,
    terms: ['kota kinabalu', 'kinabalu', '亚庇', 'kk'],
    descriptionContains: ['kota kinabalu', 'kinabalu', '亚庇', 'gaya street'],
  }),
  cityEntry('sabah-sandakan', 'Sandakan', 'sabah', 'Sabah', 'Sabah', {
    sortOrder: 2,
    terms: ['sandakan', '山打根'],
  }),
  cityEntry('sabah-tawau', 'Tawau', 'sabah', 'Sabah', 'Sabah', {
    sortOrder: 3,
    terms: ['tawau', '斗湖'],
  }),
  cityEntry('sabah-lahad-datu', 'Lahad Datu', 'sabah', 'Sabah', 'Sabah', {
    sortOrder: 4,
    terms: ['lahad datu', '拿笃'],
  }),
  cityEntry('sabah-keningau', 'Keningau', 'sabah', 'Sabah', 'Sabah', {
    sortOrder: 5,
    terms: ['keningau', '根地咬'],
  }),
  cityEntry('sabah-semporna', 'Semporna', 'sabah', 'Sabah', 'Sabah', {
    sortOrder: 6,
    terms: ['semporna', '仙本那', 'mabul', 'kapalai'],
  }),

  // ── Sarawak ───────────────────────────────────────────────────────────
  regionEntry('sarawak', 'Sarawak', {
    aliases: ['sarawak', '砂拉越'],
    sortOrder: 11,
  }),
  cityEntry('sarawak-kuching', 'Kuching', 'sarawak', 'Sarawak', 'Sarawak', {
    sortOrder: 1,
    featured: true,
    recommended: true,
    recommendOrder: 4,
    terms: ['kuching', '古晋'],
  }),
  cityEntry('sarawak-miri', 'Miri', 'sarawak', 'Sarawak', 'Sarawak', {
    sortOrder: 2,
    terms: ['miri', '美里'],
  }),
  cityEntry('sarawak-sibu', 'Sibu', 'sarawak', 'Sarawak', 'Sarawak', {
    sortOrder: 3,
    terms: ['sibu', '诗巫'],
  }),
  cityEntry('sarawak-bintulu', 'Bintulu', 'sarawak', 'Sarawak', 'Sarawak', {
    sortOrder: 4,
    terms: ['bintulu', '民都鲁'],
  }),
  cityEntry('sarawak-sri-aman', 'Sri Aman', 'sarawak', 'Sarawak', 'Sarawak', {
    sortOrder: 5,
    terms: ['sri aman', '诗里阿曼'],
  }),
  cityEntry('sarawak-limbang', 'Limbang', 'sarawak', 'Sarawak', 'Sarawak', {
    sortOrder: 6,
    terms: ['limbang', '林梦'],
  }),

  // ── Selangor ──────────────────────────────────────────────────────────
  regionEntry('selangor', 'Selangor', {
    aliases: ['selangor', '雪兰莪'],
    sortOrder: 12,
  }),
  cityEntry('selangor-shah-alam', 'Shah Alam', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 1,
    terms: ['shah alam', '莎阿南'],
  }),
  cityEntry('selangor-petaling-jaya', 'Petaling Jaya', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 2,
    terms: ['petaling jaya', 'pj', '八打灵'],
  }),
  cityEntry('selangor-subang-jaya', 'Subang Jaya', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 3,
    terms: ['subang jaya', 'subang', '梳邦'],
  }),
  cityEntry('selangor-klang', 'Klang', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 4,
    terms: ['klang', '巴生'],
  }),
  cityEntry('selangor-kajang', 'Kajang', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 5,
    terms: ['kajang', '加影'],
  }),
  cityEntry('selangor-puchong', 'Puchong', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 6,
    terms: ['puchong', '蒲种'],
  }),
  cityEntry('selangor-ampang', 'Ampang', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 7,
    terms: ['ampang', '安邦'],
  }),
  cityEntry('selangor-rawang', 'Rawang', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 8,
    terms: ['rawang', '万挠'],
  }),
  cityEntry('selangor-cyberjaya', 'Cyberjaya', 'selangor', 'Selangor', 'Selangor', {
    sortOrder: 9,
    terms: ['cyberjaya', '赛城'],
  }),

  // ── Terengganu ────────────────────────────────────────────────────────
  regionEntry('terengganu', 'Terengganu', {
    aliases: ['terengganu', '登嘉楼'],
    sortOrder: 13,
    recommended: true,
    recommendOrder: 10,
  }),
  cityEntry('terengganu-kuala-terengganu', 'Kuala Terengganu', 'terengganu', 'Terengganu', 'Terengganu', {
    sortOrder: 1,
    terms: ['kuala terengganu', '瓜拉登嘉楼'],
  }),
  cityEntry('terengganu-kemaman', 'Kemaman', 'terengganu', 'Terengganu', 'Terengganu', {
    sortOrder: 2,
    terms: ['kemaman', '甘马挽', 'chukai'],
  }),
  cityEntry('terengganu-dungun', 'Dungun', 'terengganu', 'Terengganu', 'Terengganu', {
    sortOrder: 3,
    terms: ['dungun', '龙运'],
  }),
  cityEntry('terengganu-marang', 'Marang', 'terengganu', 'Terengganu', 'Terengganu', {
    sortOrder: 4,
    terms: ['marang', '马江'],
  }),

  // ── Federal Territories ─────────────────────────────────────────────────
  regionEntry('kuala-lumpur', 'Kuala Lumpur', {
    federal: true,
    aliases: ['kl', 'kuala lumpur', '吉隆坡'],
    sortOrder: 14,
    featured: true,
    recommended: true,
    recommendOrder: 2,
  }),
  regionEntry('putrajaya', 'Putrajaya', {
    federal: true,
    aliases: ['putrajaya', '布城'],
    sortOrder: 15,
    minPlaces: 1,
  }),
  regionEntry('labuan', 'Labuan', {
    federal: true,
    aliases: ['labuan', '纳闽'],
    sortOrder: 16,
    minPlaces: 1,
  }),
]

fs.writeFileSync(outPath, `${JSON.stringify(locations, null, 2)}\n`, 'utf8')
console.log(`Wrote ${locations.length} locations`)
console.log(`  Regions: ${locations.filter((l) => l.type === 'state' || l.type === 'federal_territory').length}`)
console.log(`  Cities: ${locations.filter((l) => l.type === 'subdestination').length}`)
