"""
Extract specific POI place names from cleaned RedNote posts.

Priority: RedNote pin/address patterns > English venue names > spaCy FAC/ORG only.
Does NOT use spaCy GPE/LOC (cities/countries are too broad for Explore cards).

Reads:  server/data/merged-data.json
Writes: server/data/places.json
        server/data/places-extract-stats.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# spaCy is imported lazily in main() only when --use-spacy is passed; the
# default extraction is rule-based and needs no NLP model installed.

ROOT = Path(__file__).resolve().parent.parent
MERGED_DATA = ROOT / "server" / "data" / "merged-data.json"
PLACES_OUT = ROOT / "server" / "data" / "places.json"
STATS_OUT = ROOT / "server" / "data" / "places-extract-stats.json"
GOOGLE_ENRICHMENT_STORE = ROOT / "server" / "data" / "places-google-enrichment.json"
NAME_OVERRIDE_STORE = ROOT / "server" / "data" / "places-name-overrides.json"

# --- blocklists: too broad or not a visitable POI ---

BROAD_GEO = {
    # Countries & regions
    "马来西亚", "大马", "马来", "南洋", "东南亚", "亚洲", "欧洲", "美洲",
    "中国", "日本", "韩国", "印度", "泰国", "越南", "印尼", "新加坡",
    "英国", "荷兰", "法国", "德国", "美国", "澳洲", "澳大利亚",
    "malaysia", "southeast asia", "asia", "europe",
    # States / cities (English)
    "kuala lumpur", "penang", "melaka", "malacca", "johor", "sabah", "sarawak",
    "pahang", "perak", "selangor", "kedah", "kelantan", "terengganu", "perlis",
    "negeri sembilan", "putrajaya", "labuan", "ipoh", "langkawi", "kota kinabalu",
    "malaysia", "cameron highlands",
    # States / cities (Chinese)
    "吉隆坡", "槟城", "槟城岛", "马六甲", "柔佛", "新山", "沙巴", "亚庇", "仙本那",
    "砂拉越", "古晋", "彭亨", "霹雳", "怡保", "雪兰莪", "吉兰丹", "登嘉楼",
    "玻璃市", "森美兰", "兰卡威", "金马伦", "云顶",
    "瓜拉登嘉楼", "kuala terengganu", "关丹", "kuantan", "停泊岛",
    "唐人街", "东海岸", "马来西亚东海岸",
}

GENERIC_JUNK = {
    "旅游", "旅行", "自由行", "攻略", "打卡", "推荐", "美食", "餐厅", "酒店", "民宿",
    "周末", "假期", "小红书", "笔记", "分享", "日常", "vlog", "travel vlog",
    "巴刹", "市场", "夜市", "商场", "广场", "日落", "日出", "夜景", "风景",
    "欧式", "英式", "法式", "南洋", "紫红色", "粉色", "绿色", "蓝色",
    "马来西亚旅游", "吉隆坡旅游", "槟城自由行", "人就要去没有天花板的地方", "东北", "槟城vlog",
    "登嘉楼的其中一个岛屿", "马来西亚东海岸的边境州属", "东海岸小众海岸线",
    "唐人街的传统咖啡店", "比马代便宜3倍",
    "exclusive perk for", "discount promotion", "promotion in partnership",
    "valid till", "show room key", "hotel guests", "pakej penginapan",
    "bayview hotel", "last booking", "jenis penginapan",
    "sampai kawan-kawan tak henti ambik gambar",
    "乐高乐园",
    "JB pelangi",
    "Mount Austin的新咖啡馆以大胆又鲜艳的配色设计",
    "新山老街",
    "新山餐厅",
    "新山美食街",
    "Johor Jaya",
    "Komtar JBCC",
    "柔佛州和彭亨州的交界处",
    "Alamat",
    "Muar 分店 No 15 &",
    "Muar 分店限定 No 15 &",
    "蟹佬仔BM Juru",
    "蜀国印象火锅Batu P",
    "抵达麻坡1小时40分钟",
    "人少、安静、超好出片",
    "Pelangi的新店【焱烤三味】",
    "hardrockhotel",
    "kacanicafe",
    "DangaPark",
    "陈旭年老街",
    "Tiarasa escapes",
    "凤凰山森林公园",
    "森林咖啡",
    "Cameron Lavender 住宿方面",
    "Song Yan 距离KL一小时的世外桃源",
    "源记茶室 对面茶室 树屎粉 地址",
    "关丹 Kuantan",
    "来关丹旅游",
    "Bentong",
    "Cherating",
    "玻璃口新村",
    "乡村稻田·日系骑行 关键词",
    "Nino Nina云顶意大利餐厅",
    "澳门新马路",
    "奥利匹克国家公园",
    "Bukit Nanas Forest Reserve",
    "Espira Kinrara",
    "Trekking to National Park",
    "nak booking hotel",
    "What makes this park",
    "Published on Main",
    "Lunch on a floating restaurant",
    "inside CH floral park",
    "关丹壁画街",
    "花园餐厅",
    "海边酒店",
    "高原咖啡",
    "Seri",
    "月之影度假村",
    "登嘉楼唐人街",
    "热浪岛度假村",
    "box Apam Nasi ke Petronas",
    "Marriott Resort",
    "浪中岛Lang Tengah",
    "Pulau Kekabu 海岸步道",
    "Kota Bharu",
    "Gunung Stong （Jelawang",
    "吉兰丹 Dabong 的 Gua Ikan",
    "吉兰丹州·道北 在吉兰丹道北",
    "[话题]",
    "吉兰丹咖啡",
    "Air Terjun Tertinggi di Asia Tenggara",
    "Kampung Kraftangan 4. Al-Quran Rehal Park",
    "kelantan Atas Cafe",
    "Meet up at Gua Ikan carpark",
    "Day2 【近岛游",
    "Day1 【早班机",
    "图源网络",
    "亚庇酒店",
    "tambunan Ranau 从亚庇",
    "Kota Belud",
    "Day 2 - desa diary farm",
    "亚庇凯悦尚萃酒店",
    "沙巴亚庇",
    "Bukit Pau Peak",
    "位置与时间",
    "Tapi tak nak hotel",
    "Ladang Tenusu Desa Cattle",
    "Desa Farm",
    "Bundu Tuhan",
    "测评 #美食探店",
    "古晋风味小吃市场",
    "古晋市中心",
    "地点名字",
    "诗巫福音书局正对面",
    "H coffee隔壁",
    "Sarawak Mega Fair",
    "MULA值不值得去",
    "Woo. You OD3",
    "Kuching猫雕像Ca",
    "Medan Mall",
    "Vivacity Megamall",
    "VONA la boutique",
    "霸王茶姬 Taman Sahabat",
    "Tanjung Cafe",
    "SaltAndPepperCafe",
    "Jom ke Pinang Bistro",
    "不用开车也能逛整天",
    "Check in Hotel",
    "Google",
    "Pick up",
    "Stay",
    "Venue",
    "Kuala Lumpur •吉隆坡",
    "Bendera",
    "e ready evenings get hectic on",
    "rket in KL. Swipe left",
    "HadaLabo快闪店 Fahrenheit门口 薅羊毛时间到 简单完",
    "官方唐人街",
    "雨中的老街",
    "占美清真寺 被认定为吉隆坡发源地",
    "独立广场 就在大厦对面",
    "苏丹阿都沙",
    "一楼酒馆",
    "南中国海的登嘉楼海鲜生猛大尾",
    "槟城l 不起眼的小店",
    "住宅区的café吃午餐",
    "Check in 住宿",
    "午餐-香醋面粉糕",
    "pet friendly cafe",
    "Abundance",
    "甘榜外广场（",
    "Alor Setar Hospital",
    "Masjid Putra大概30分钟抵达",
    "距吉隆坡市区约30公里的布城",
    "城中的布特拉再也湖之上",
    "Hotel U Prince Prague by BHG",
    "Modo Gelato （8/10）",
    "来KL不只是逛商场",
    "如果不好找",
    "箱拿出来是冰冰的",
    "亲测好吃的街",
    "素食餐厅",
    "氛围感餐厅",
    "高级餐厅",
    "Comment HOTEL",
    "Colmar Tropicale",
    "Bespoke Hotel Puchong",
    "Save this KL checklist",
    "Gambar kiriman customer",
    "cek post di atas",
    "Trang 早市",
    "Geology Museum",
    "KopiKhoo Pte Ltd",
    "了凡油鸡饭 Chinatown Complex",
    "比马尔代夫少3倍",
    "Kota Kinabalu 亚庇 追逐全球TOP3的日落～ 丹绒亚路海滩",
    "定位导航*",
    "米其林餐厅",
    "(星期一休息） 地址",
    "马来半岛西海岸",
    "394万在雪兰莪",
    "SetiaEcoPark",
    "Tamarind square",
    "beaconresort",
    "Ippudo 好消息",
    "Subang Jaya 4. Good Times B",
    "海景餐厅",
    "Main shop",
    "Harry Potter",
    "Gibbon Re",
    "暑期必去度假酒店",
    "Brezza Hotel ( Pekan Lumut, Perak )",
    "unwind at Brezza Hotel",
    "兵如港忠记大树头炸料粉",
    "belantararesort",
    "arina Island",
    "BATU GAJAH(weekday only)(pick",
    "Tasik Cermin 1 &",
    "Kin Loong Valley (跟第一景点连着的)",
    "十八丁 想找槟城周边的地方逛逛",
    "在怡保GREENTOWN有一家超特别的美食店",
    "by Hilton Damai Laut Resort",
    "KL—IPOH",
    "来到怡保老城区",
    "高速出口10分钟就到",
    "霹雳的Tambun住宅区",
    "日记 #seremban",
    "日记 #美食探店",
    "秋千就在Kausar餐厅旁边",
    "Sulap II homestay 的周围",
    "马六甲酒店",
    "泰国餐厅",
    "水上餐厅",
    "海景咖啡",
    "机位 从klcc大门出来",
    "马六甲酒店",
    "美丽华鸭蛋炒粿条",
    "美娜多酒店",
    "主题公园",
    "小众酒店",
    "文冬温德姆玖霄明轩云海酒店",
    "高空餐厅",
    "槟城白咖啡",
    "Coffee Tree & Coffee",
    "【交通指南】 位置",
    "交通指南",
    "午餐 – COFFEE TI",
    "是森美兰大家不要吓到",
    "Port Dick",
    "波德申（Port Dickson）",
    "sila beredar ke",
    "度假风酒店",
    "旅行必住酒店",
    "美国Acadia national park - Beehive trail",
    "美国国家公园",
    "Albania (Europe) Credits",
    "Temiang Pantai Highway",
    "香港街民众海鲜",
    "eco-farm",
    "Semenyih Broga 的【Twin Jets Resor】",
    "芙蓉 Seremban",
    "品香楼茶室 星期三休息",
    "芙蓉记茶室与你见面",
    "芙蓉记茶室 15G",
    "昌記肉骨茶 Restoran Cheong Kee Bak Kut Teh",
    "马六甲市中心",
    "马六甲鸡场街",
    "怎么拍 马六甲随处拍都好好看",
    "马六甲Citywalk 慢走",
    "马六甲Klebang新开发商业区",
    "马六甲 马来西亚",
    "马六甲街",
    "马六甲餐厅",
    "马六甲 14片以上包邮 西马",
    "马六甲老城",
    "Pantai Klebang",
    "Chasing Sunsets Cafe",
    "Jonker Street Night Market",
    "荷兰红屋 东南亚最老的荷兰建筑",
    "维多利亚喷泉 就在红屋正对面",
    "圣保罗教堂旧址 要爬一小段坡",
    "Pangsapuri Taman Tasik Utama",
    "Lian Pang Kopitiam",
    "Melaka Sentral",
    "Durian Tunggal",
    "MUSE Sunset Beach Bar",
    "晋好吃美食阁",
    "Atlantis Residence by Heystay 直接住一晚",
    "Atlantis Residences Melaka",
    "老广点心 NO",
    "日日吉日 Kopi Harian",
    "河边散步",
    "Kompleks Perniagaan Kota Syahbandar",
}

JUNK_PATTERN = re.compile(
    r"^(?:"
    r"人就要|我的|这个|那个|一个|这里|那里|"
    r"第[一二三四五六七八九十\d]+[天站]|"
    r"travel\s*vlog|vlog|"
    r"[\d#@]+|"
    r".{0,2}$"
    r")",
    re.I,
)

# Address line fragments — not visitable POI names (e.g. "Lot 9048" → "Lot").
ADDRESS_FRAGMENT = re.compile(
    r"^(?:"
    r"lot|no\.?|blk\.?|block|unit|level|floor|flr|"
    r"gate|gat|sek|spu|pula|tuah|hock|"
    r"\d+[a-z]?$"
    r")$",
    re.I,
)

SENTENCE_LIKE_PATTERN = re.compile(
    r"[，,。!！?？:：;；]|"
    r"(?:位于|路线|附近|生活|适合|推荐|攻略|终于|发现|我们|可以|一定要|超慢|"
    r"充满|打卡|一日游|三天两晚|两天一夜|vlog)",
    re.I,
)
BAD_SUBSTRINGS = (
    "路线", "建议", "记得", "我个人", "首先", "主打", "居然", "只需", "每次",
    "有没有", "不过", "虽然", "搭配", "点餐", "家庭式", "评价", "计划", "逃离",
    "开门", "价位", "拍摄", "第一天", "第二天", "第三天",
    "吃住玩", "价格体验", "视频里", "狂推", "性价比", "必吃", "很多人", "其中",
    "带着父母", "这次带着", "作为一个", "真的太多", "隐藏在", "个人很喜欢",
    "只有本地人", "较少有同时", "这里是放生", "图6", "图11", "图4",
    "便宜3倍", "比马代", "低调", "隐藏版", "世界级", "天堂海岛",
    "工作人员", "大多都是华人", "名字 The", "其中一个",
    "沿海", "小村庄", "野餐的理想", "房源名字", "酒店位置", "就在登嘉楼",
    "马来西亚登嘉楼", "马来西亚热浪", "马来西亚丁加奴", "第一站就冲",
    "路过简单", " 店里", "夏日么么茶", "一年只开放", "定位导航",
)
OPENING_HOURS = re.compile(r"⏰|\b\d{1,2}(?:\.\d{2})?\s*(?:am|pm)\b", re.I)
CAPTION_START = re.compile(r"^(?:马来西亚|酒店位置|就在|登嘉楼首府|新沄滨)")
LONG_NARRATIVE = re.compile(r"[～，。]|《.+》")
PROMO_CONTENT = re.compile(
    r"(?:"
    r"exclusive perk|discount promotion|promotion in partnership|valid till|"
    r"show room key|%\s*off|giveaway|sponsored|promo code|coupon code|"
    r"limited time offer|get rm\d+|rm\d+\s*(?:off|discount)|"
    r"we're thrilled to announce|special offer|hotel guests?|guest perk|"
    r"partnership with|discount promotion|pakej\s+penginapan|last booking|"
    r"staying period|jenis penginapan|sah sehingga|sebilik|nett/room|"
    r"/room/night|extra bed with breakfast|price\s*💰|add-on|buffet br|"
    r"superior room|deluxe room|suite room|family room|hillview|seaview"
    r")",
    re.I,
)
RATE_CARD = re.compile(r"RM\s*\d+", re.I)
FESTIVAL_PATTERN = re.compile(
    r"(?:"
    r"\bfestival\b|"
    r"\bfood\s+fest\b|"
    r"bon\s*odori|"
    r"pop[-\s]?up\s+festival|"
    r"kl\s+festival|"
    r"美食市集\s*food\s+fest|"
    r"(?:beer|music|light|street\s+food|dragon\s+boat)\s+festival|"
    r"rainforest\s+world\s+music|"
    r"yosakoi\s+parade|"
    r"festival\s+wakoh|"
    r"asian\s+street\s+food\s+festival|"
    r"(?:啤酒|音乐|灯光|投影|文化|旅游)节|"
    r"嘉年华|"
    r"美食市集.*即将登陆|"
    r"免费入场|"
    r"活动亮点"
    r")",
    re.I,
)

GENERIC_NAME_TOKENS = {
    "beach", "resort", "hotel", "island", "pulau", "coral", "cafe", "restaurant",
    "restoran", "food", "travel", "malaysia", "kopitiam", "homestay", "chalet",
    "villa", "lodge", "inn", "bar", "park", "market", "centre", "center", "super",
    "beachfront", "seaview", "hillview", "family", "deluxe", "superior", "suite",
    "room", "rooms", "front", "view", "bay", "coast", "marine", "diving",
    "snorkeling", "snorkelling",
}

LOCATION_ENTITIES = [
    ("redang", re.compile(r"redang|热浪岛", re.I)),
    ("tenggol", re.compile(r"tenggol|天鹅岛", re.I)),
    ("tioman", re.compile(r"tioman|刁曼|paya\s+beach", re.I)),
    ("perhentian", re.compile(r"perhentian|停泊岛", re.I)),
    ("kapas", re.compile(r"pulau\s+kapas|kapas\s+island|棉花岛", re.I)),
    ("langkawi", re.compile(r"langkawi|兰卡威", re.I)),
    ("penang", re.compile(r"penang|georgetown|槟城", re.I)),
    ("genting", re.compile(r"genting|云顶", re.I)),
    ("cameron", re.compile(r"cameron|金马伦", re.I)),
    ("kundasang", re.compile(r"kundasang|昆达山", re.I)),
    ("kinabalu", re.compile(r"kinabalu|神山", re.I)),
    ("sipadan", re.compile(r"sipadan|西巴丹", re.I)),
    ("mataking", re.compile(r"mataking", re.I)),
    ("kenyir", re.compile(r"kenyir|tasik\s+kenyir|肯逸", re.I)),
]
NAME_BEFORE_STREET = re.compile(
    r"^(.+?)\s+(?:Jalan|Jln\.?|Lorong|Persiaran|Jln)\s+",
    re.I,
)
STATE_WORD_PATTERN = re.compile(
    r"(?:^|[\s在])(?:perak|penang|melaka|johor|sabah|sarawak|pahang|kuala\s*lumpur|terengganu|"
    r"槟城|霹雳|马六甲|柔佛|沙巴|砂拉越|彭亨|吉隆坡|登嘉楼)(?:$|[\s附近在])",
    re.I,
)

# Marketing / caption narration — not POI names.
CAPTION_NARRATION = re.compile(
    r"(?:"
    r"这里|他们|都是|很多|人在|体验|视频|周末|价格|便宜|性价比|狂推|必吃|"
    r"其中|带着|这次|作为一个|真的|太多|隐藏|低调|世界级|个人|喜欢|"
    r"只有本地|较少有|放生|工作人员|华人|名字\s|The|其中一个|"
    r"吃住玩|价格体验|视频里|比马代|便宜\d+倍|"
    r"图\d+|⛰️|⛅️|️"
    r")",
    re.I,
)

FIGURE_REF = re.compile(r"图\d+")
PRICE_FRAGMENT = re.compile(r"(?:RM\s*\d+|/\s*人|\d+\s*/\s*人)", re.I)
INCOMPLETE_ENDING = re.compile(r"(?:而|的|在|了|与|和|是|有|很|都|也|就|还|又|但|—|…|\.{2,})$")
MULTI_STOP_LIST = re.compile(r"——|—{2,}")
BRACKET_WRAP = re.compile(r"^【([^】]{2,40})】$")
ENGLISH_VENUE_TAIL = re.compile(
    r"(?:名字\s+|^|[\s，,—\-/]+)"
    r"([A-Z][A-Za-z0-9'&.\s\-]{2,42}(?:"
    r"Resort(?:\s*&\s*Spa)?|Hotel|Cafe|Restaurant|Bar|Museum|Temple|Beach|Island|"
    r"Waterfall|Gallery|Mosque|Park|Lodge|Hostel|Homestay|Resort|Bistro|"
    r"Bay Resort|Mall|Kopitiam|Warung"
    r"))\s*$",
    re.I,
)
ENGLISH_VENUE_HEAD = re.compile(
    r"^([A-Za-z][A-Za-z0-9'&.\s\-]{2,35}(?:"
    r"Resort(?:\s*&\s*Spa)?|Hotel|Cafe|Restaurant|Bar|Museum|Temple|Beach|"
    r"Island|Waterfall|Gallery|Mosque|Park|Lodge|Hostel|Homestay|Bistro|"
    r"Bay Resort|Mall|Kopitiam|Warung"
    r"))\b",
    re.I,
)
ADDRESS_ONLY = re.compile(
    r"^(?:"
    r"(?:Jalan|Jln\.?|Lorong|Persiaran|Lebuh|Lot)\s+.+|"
    r"Lot\s+\d+.*|"
    r"Shoplot\s+.+|"
    r"\d{5}\s*$"
    r")$",
    re.I,
)

POI_HINT = re.compile(
    r"咖啡|cafe|café|restaurant|bistro|kitchen|bar|grill|"
    r"餐厅|饭店|食阁|档口|小吃|茶室|甜品|烘焙|"
    r"酒店|hotel|resort|hostel|homestay|farmstay|farm|"
    r" mosque|mosque|清真寺|教堂|寺庙|庙|"
    r"博物馆|museum|gallery|"
    r"公园|park|garden|海滩|beach|"
    r"街|路|lane|mall|tower|塔|坊|阁|楼|湾|岛|"
    r"庄园|榴莲|durian",
    re.I,
)

# RedNote / address patterns (highest precision)
PIN_RULE = re.compile(
    r"📍\s*([^\n#@]+?)(?=\s+\d{1,4}\s*[,，、]|\s+\d{1,4}\s+[A-Za-z]|\s*[,，。\n#]|$)",
)
PIN_SIMPLE = re.compile(r"📍\s*([^\n,，。#@]{2,35})")
LOCATED_RULE = re.compile(r"(?:位于|坐落于|地址[:：]?)\s*([^\n,，。]{2,40})")
JALAN_RULE = re.compile(
    r"([^\n,，。]{2,30}?)\s+(?:\d+[,\s-]*)?(?:Jalan|Jln\.?|Lorong|Persiaran|Psis\.?|Lebuh|Lot)\b",
    re.I,
)
ENGLISH_VENUE = re.compile(
    r"\b([A-Za-z][A-Za-z0-9'&\.\s\-]{2,45}(?:"
    r"Cafe|Coffee|Restaurant|Hotel|Resort|Farmstay|Farm|Bistro|Bar|Kitchen|Museum|Mosque|Gallery|Park"
    r"))\b",
    re.I,
)
HASHTAG_PLACE = re.compile(r"#([^\s#]{2,20}(?:咖啡|餐厅|酒店|街|坊|公园|博物馆|巴刹|市场))")
EXPLORE_TITLE_VENUE = re.compile(
    r"探店\s*"
    r"(?:槟城|吉隆坡|马六甲|新山|怡保|亚庇|古晋|沙巴|砂拉越|柔佛|彭亨|登嘉楼|关丹|霹雳)?\s*"
    r"([^-－|｜\n]+?)"
    r"(?:\s*[-－|｜]|$)",
    re.I,
)
VENUE_BRAND_INTRO = re.compile(r"开了一段时间的\s*([^是来\s]{2,40}?)\s*是来自", re.I)
MENU_ITEM_NAME = re.compile(
    r"^(\w+)\s+\1\s+(?:bar|cafe|tea|coffee|latte|mocha|juice|smoothie)$",
    re.I,
)

NER_LABELS = {"FAC", "ORG"}  # landmarks & businesses only — no GPE/LOC

SOURCE_PRIORITY = {"pin": 0, "title": 0, "address": 1, "jalan": 2, "venue": 3, "hashtag": 4, "spacy": 5}

# Direction / waypoint names (lobby, entrance) — not standalone destinations.
ROUTE_LANDMARK = re.compile(
    r"(?:^路线|^route\b|\b(?:lobby|entrance|大堂|入口|扶梯|escalator|"
    r"parking(?:\s*lot)?|car\s*park|bus\s*stop|train\s*station|"
    r"airport|mrt|lrt)\b)",
    re.I,
)

# Keep extraction focused on Malaysia travel posts.
MALAYSIA_HINT_PATTERN = re.compile(
    r"malaysia|kuala\s*lumpur|penang|melaka|malacca|johor|sabah|sarawak|"
    r"pahang|perak|selangor|kedah|kelantan|terengganu|perlis|"
    r"negeri\s*sembilan|putrajaya|labuan|langkawi|ipoh|genting|kundasang|"
    r"吉隆坡|槟城|马六甲|柔佛|沙巴|砂拉越|彭亨|霹雳|雪兰莪|吉打|吉兰丹|登嘉楼|"
    r"玻璃市|森美兰|兰卡威|怡保|云顶|金马伦|马来西亚",
    re.I,
)
OUTSIDE_GEO_PATTERN = re.compile(
    r"东北|哈尔滨|吉林|长白山|延吉|长春|松花湖|天池|伪满|"
    r"北京|上海|广州|深圳|重庆|杭州|成都|西安|武汉|南京|苏州|"
    r"江西|九江|广东|揭阳|普宁|青岛|大理|丽江|三亚|厦门|"
    r"湖南|湖北|河南|河北|山东|山西|陕西|四川|云南|贵州|福建|浙江|安徽|江苏|"
    r"台湾|taiwan|十分车站|香港|hong\s*kong|尖沙咀|旺角|铜锣湾|上环|澳门|macau|"
    r"中国|china|japan|korea|thailand|vietnam|indonesia|singapore|europe",
    re.I,
)


def normalize_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def is_address_fragment(name: str) -> bool:
    key = normalize_key(name)
    if ADDRESS_FRAGMENT.match(key):
        return True
    # "Lot 9048" style — number-only tail with short prefix
    if re.fullmatch(r"lot\s*\d+", key):
        return True
    return False


def sanitize_text(text: str) -> str:
    if not text:
        return ""
    cleaned = "".join(ch for ch in text if not (0xD800 <= ord(ch) <= 0xDFFF))
    return cleaned.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")


def is_malaysia_post(post: dict) -> bool:
    state = sanitize_text(str(post.get("state") or "")).strip()

    text = sanitize_text(
        " ".join(
            [
                str(post.get("sourceKeyword") or ""),
                str(post.get("location") or ""),
                str(post.get("title") or ""),
                str(post.get("description") or ""),
            ]
        )
    )

    has_malaysia_hint = bool(MALAYSIA_HINT_PATTERN.search(text))
    outside_hits = OUTSIDE_GEO_PATTERN.findall(text)

    # Check foreign signal FIRST — the state label may have been mis-inferred
    # (e.g. a viral China meme scraped under a KL keyword). A strong outside
    # signal with no Malaysia hint means it's not a Malaysia post, whatever the
    # state says.
    if outside_hits and not has_malaysia_hint:
        return False
    if len(outside_hits) >= 2 and not has_malaysia_hint:
        return False

    # A specific (non-"Malaysia") state label is a Malaysia signal only once the
    # foreign-content checks above have passed.
    if state and state != "Malaysia":
        return True
    if not text:
        return False

    return has_malaysia_hint or state == "Malaysia"


def clean_name(raw: str) -> str | None:
    name = raw.strip()
    name = re.sub(r"^[📍🏠🌴✨🔥]+\s*", "", name)
    name = re.sub(r"\s+", " ", name)
    name = name.strip(" ,，。!！?？~～·|｜/\\-")
    if not name or len(name) > 45:
        return None
    if re.fullmatch(r"[\W\d_]+", name):
        return None
    return name


def is_menu_item_name(name: str) -> bool:
    key = normalize_key(name)
    if MENU_ITEM_NAME.match(key):
        return True
    parts = key.split()
    if len(parts) == 3 and parts[0] == parts[1] and parts[2] in {
        "bar", "cafe", "tea", "coffee", "latte", "mocha", "juice", "smoothie",
    }:
        return True
    return False


def is_festival_name(name: str) -> bool:
    return bool(FESTIVAL_PATTERN.search(name or ""))


def is_festival_post(post: dict) -> bool:
    text = " ".join(
        [
            str(post.get("title") or ""),
            str(post.get("description") or ""),
            str(post.get("location") or ""),
        ]
    )
    return bool(FESTIVAL_PATTERN.search(text))


def is_blocked(name: str) -> bool:
    key = normalize_key(name)
    if is_festival_name(name):
        return True
    if is_address_fragment(name):
        return True
    if key in {normalize_key(x) for x in BROAD_GEO}:
        return True
    if key in {normalize_key(x) for x in GENERIC_JUNK}:
        return True
    if JUNK_PATTERN.match(name):
        return True
    # Pure style/color words
    if re.fullmatch(r"[\u4e00-\u9fff]{2}(?:式|风|色)", name):
        return True
    return False


def salvage_venue_name(name: str) -> str | None:
    """Pull a real venue name out of caption-style mixed text."""
    stripped = name.strip()

    m = BRACKET_WRAP.match(stripped)
    if m:
        return clean_name(m.group(1))

    # 《Beanswork Superhero Cafe》 style
    m = re.search(r"《([^》]{2,40})》", stripped)
    if m:
        return clean_name(m.group(1))

    m = NAME_BEFORE_STREET.match(stripped)
    if m:
        prefix = clean_name(m.group(1).strip())
        if prefix and len(prefix) >= 4 and not CAPTION_NARRATION.search(prefix):
            return prefix

    m = ENGLISH_VENUE_TAIL.search(stripped)
    if m:
        salvaged = clean_name(m.group(1))
        if salvaged and len(salvaged) >= 4:
            return salvaged

    m = ENGLISH_VENUE_HEAD.match(stripped)
    if m and len(stripped) > len(m.group(1)) + 8:
        salvaged = clean_name(m.group(1))
        if salvaged and len(salvaged) >= 4:
            return salvaged

    embedded = re.search(
        r"\b("
        r"Kenyir\s+Lake|Tasik\s+Kenyir|Pulau\s+Kapas|Pulau\s+Redang|"
        r"Perhentian(?:\s+Island)?|The\s+Resthouse|Summerbay(?:\s+Resort)?|"
        r"Redang\s+Bay\s+Resort|Taaras\s+Beach\s+Resort|"
        r"Lang\s+Tengah|Kapas\s+Island"
        r")\b",
        stripped,
        re.I,
    )
    if embedded:
        return clean_name(embedded.group(1))
    return None


def passes_output_quality(name: str) -> bool:
    if not name or len(name) < 3:
        return False
    if is_blocked(name) or is_address_fragment(name):
        return False
    if ADDRESS_ONLY.match(name.strip()):
        return False
    if CAPTION_NARRATION.search(name):
        return False
    if FIGURE_REF.search(name):
        return False
    if PRICE_FRAGMENT.search(name):
        return False
    if INCOMPLETE_ENDING.search(name.strip()):
        return False
    if MULTI_STOP_LIST.search(name):
        return False
    if OPENING_HOURS.search(name):
        return False
    if CAPTION_START.search(name):
        return False
    if PROMO_CONTENT.search(name):
        return False
    cjk = len(re.findall(r"[\u4e00-\u9fff]", name))
    if cjk > 10 and LONG_NARRATIVE.search(name) and not POI_HINT.search(name):
        return False
    if cjk > 14 and not POI_HINT.search(name):
        return False
    if "/" in name and cjk > 6 and not POI_HINT.search(name):
        return False
    if any(token in name for token in BAD_SUBSTRINGS):
        return False
    if SENTENCE_LIKE_PATTERN.search(name) and len(name) > 12 and not POI_HINT.search(name):
        return False
    if len(name.split()) > 7:
        return False
    return True


def is_promotional_post(post: dict) -> bool:
    text = " ".join(
        [
            str(post.get("title") or ""),
            str(post.get("description") or ""),
            str(post.get("location") or ""),
            str(post.get("sourceKeyword") or ""),
        ]
    )
    if PROMO_CONTENT.search(text):
        return True
    if len(RATE_CARD.findall(text)) >= 3:
        return True
    return False


def distinctive_tokens(name: str) -> list[str]:
    return [
        token
        for token in re.split(r"[\s,/|_-]+", normalize_key(name))
        if len(token) >= 4 and token not in GENERIC_NAME_TOKENS
    ]


def detect_location_entities(text: str) -> list[str]:
    return [entity_id for entity_id, pattern in LOCATION_ENTITIES if pattern.search(text or "")]


def entities_conflict(place_entities: list[str], post_entities: list[str]) -> bool:
    if not place_entities or not post_entities:
        return False
    place_set = set(place_entities)
    return any(entity not in place_set for entity in post_entities)


def post_relevant_to_place(post: dict, place_name: str, place_state: str) -> bool:
    if is_promotional_post(post):
        return False

    post_state = infer_post_state(post)
    if place_state not in ("", "Malaysia") and post_state not in ("", "Malaysia"):
        if place_state != post_state:
            return False

    text = f"{post.get('title', '')} {post.get('description', '')}"
    text_lower = text.lower()
    distinctive = distinctive_tokens(place_name)
    place_entities = detect_location_entities(place_name)
    post_entities = detect_location_entities(text)

    if entities_conflict(place_entities, post_entities):
        return False

    if distinctive:
        hits = [token for token in distinctive if token in text_lower]
        if hits:
            if place_entities and not post_entities:
                return True
            if not place_entities or not post_entities:
                return True
            return any(entity in post_entities for entity in place_entities)
        return False

    if place_entities:
        return any(entity in post_entities for entity in place_entities)

    return False


def is_valid_place(name: str, source: str) -> bool:
    cleaned = clean_name(name)
    if not cleaned:
        return False
    if is_blocked(cleaned):
        return False

    if source in ("pin", "address", "jalan"):
        if SENTENCE_LIKE_PATTERN.search(cleaned):
            return False
        if source in ("address", "jalan") and ADDRESS_ONLY.match(cleaned):
            return False
        if source in ("address", "jalan") and len(cleaned) < 10 and not POI_HINT.search(cleaned):
            return False
        return len(cleaned) >= 3 and passes_output_quality(cleaned)

    if source == "venue":
        if "vlog" in cleaned.lower():
            return False
        if is_menu_item_name(cleaned):
            return False
        return len(cleaned) >= 4 and passes_output_quality(cleaned)

    if source == "title":
        return len(cleaned) >= 3 and passes_output_quality(cleaned)

    if source == "hashtag":
        if "vlog" in cleaned.lower():
            return False
        return len(cleaned) >= 3 and POI_HINT.search(cleaned) and passes_output_quality(cleaned)

    if source == "spacy":
        if SENTENCE_LIKE_PATTERN.search(cleaned):
            return False
        if len(cleaned) < 3:
            return False
        if not passes_output_quality(cleaned):
            return False
        if POI_HINT.search(cleaned):
            return True
        # Longer unique names from FAC/ORG
        if len(cleaned) >= 5 and not re.fullmatch(r"[\u4e00-\u9fff]{2,4}", cleaned):
            return True
        return len(cleaned) >= 6

    return False


def finalize_display_name(raw: str) -> str | None:
    name = raw.strip()
    if "📍" in name:
        name = name.split("📍")[-1].strip()
    name = re.sub(r"[\U00010000-\U0010ffff]", "", name)  # emoji
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"\s+\d{1,4}$", "", name)
    name = re.sub(r"\s*⏰.*$", "", name)
    name = re.sub(r"\s+\d{1,2}(?:\.\d{2})?\s*(?:am|pm).*$", "", name, flags=re.I)
    name = re.sub(r"^(?:位于|路线|地址|附近)\s*", "", name)

    salvaged = salvage_venue_name(name)
    if salvaged:
        name = salvaged

    # Keep only the first segment before punctuation/arrows.
    name = re.split(r"[，,。!！?？:：;；|｜]|⬆️|⬅️|➡️|->|→", name)[0].strip()
    name = name.strip(" ,，。!！?？~～·|｜/\\-")
    # Drop leading state labels like "Perak 在Pangkor..."
    name = re.sub(
        r"^(?:Perak|Penang|Melaka|Johor|Sabah|Sarawak|Pahang|Kuala\s*Lumpur|Terengganu|"
        r"槟城|霹雳|马六甲|柔佛|沙巴|砂拉越|彭亨|吉隆坡|登嘉楼)\s+[在于靠近附近].*",
        "",
        name,
        flags=re.I,
    )

    needs_salvage = (
        len(name) > 20
        or CAPTION_NARRATION.search(name)
        or FIGURE_REF.search(name)
        or MULTI_STOP_LIST.search(name)
        or any(token in name for token in BAD_SUBSTRINGS)
    )
    if needs_salvage:
        salvaged = salvage_venue_name(name)
        if salvaged:
            name = salvaged
        elif CAPTION_NARRATION.search(name) or any(token in name for token in BAD_SUBSTRINGS):
            return None

    if STATE_WORD_PATTERN.search(name) and len(name) > 18:
        return None
    if SENTENCE_LIKE_PATTERN.search(name) and len(name) > 12 and not POI_HINT.search(name):
        return None
    if any(token in name for token in BAD_SUBSTRINGS):
        return None
    if "vlog" in name.lower():
        return None
    if len(name.split()) > 7:
        return None
    cleaned = clean_name(name)
    if not cleaned or not passes_output_quality(cleaned):
        return None
    return cleaned


def is_route_landmark(name: str) -> bool:
    key = normalize_key(name)
    if key.startswith("路线") or key.startswith("route "):
        return True
    if len(key.split()) <= 5 and ROUTE_LANDMARK.search(name):
        return True
    return False


def add_candidate(found: dict[str, tuple[str, str]], name: str, source: str) -> None:
    cleaned = finalize_display_name(name)
    if not cleaned or not is_valid_place(cleaned, source) or is_route_landmark(cleaned):
        return
    key = normalize_key(cleaned)
    if key not in found or SOURCE_PRIORITY[source] < SOURCE_PRIORITY[found[key][1]]:
        found[key] = (cleaned, source)


def collapse_extractions_in_post(extractions: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Within one post: drop route waypoints and merge substring name variants."""
    items: list[tuple[str, str, str]] = []
    for name, source in extractions:
        final = finalize_display_name(name)
        if not final or not is_valid_place(final, source):
            continue
        items.append((final, source, normalize_key(final)))

    if not items:
        return []

    non_route = [(n, s, k) for n, s, k in items if not is_route_landmark(n)]
    if non_route:
        items = non_route

    has_title = any(source == "title" for _, source, _ in items)
    if has_title:
        items = [
            (name, source, key)
            for name, source, key in items
            if not (source == "venue" and is_menu_item_name(name))
        ]

    keys = [k for _, _, k in items]
    drop_keys: set[str] = set()
    for ka in keys:
        for kb in keys:
            if ka != kb and ka in kb and len(ka) >= 10:
                drop_keys.add(ka)

    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for name, source, key in sorted(items, key=lambda x: (-len(x[0]), SOURCE_PRIORITY.get(x[1], 9))):
        if key in drop_keys or key in seen:
            continue
        seen.add(key)
        result.append((name, source))
    return result


def pick_display_name(names: list[str], sources: set[str]) -> str:
    """Prefer real venue names over address fragments or caption titles."""
    candidates = [n for n in names if not is_address_fragment(n)]
    if not candidates:
        candidates = list(names)

    def score(name: str) -> tuple:
        penalty = 0
        has_cjk = bool(re.search(r"[\u4e00-\u9fff]", name))
        if is_address_fragment(name):
            penalty += 200
        if SENTENCE_LIKE_PATTERN.search(name):
            penalty += 100
        if has_cjk and re.search(
            r"(?:Farmstay|Hotel|Resort|Cafe|Restaurant|Lobby|Gaming|Camping)", name, re.I
        ):
            penalty += 80
        if len(name) > 42:
            penalty += 40
        if len(name) < 6:
            penalty += 60
        if "pin" in sources:
            penalty -= 15
        if POI_HINT.search(name):
            penalty -= 25
        # Prefer fuller English venue names; shorter wins for mixed caption titles.
        length_key = -len(name) if not has_cjk else len(name)
        return (penalty, length_key)

    return min(candidates, key=score)


def merge_bucket_fields(target: dict, source: dict) -> None:
    target.setdefault("_allNames", set()).add(target["name"])
    target["_allNames"].add(source["name"])
    for state, count in source["states"].items():
        target["states"][state] += count
    target["categories"].update(source["categories"])
    target["sources"].update(source["sources"])
    for platform, count in source.get("platforms", {}).items():
        target["platforms"][platform] += count
    target["totalLikes"] += source["totalLikes"]
    target["totalCollected"] += source["totalCollected"]
    for post_id in source["postIds"]:
        if post_id not in target["postIds"]:
            target["postIds"].append(post_id)
    if source["bestLikes"] > target["bestLikes"]:
        target["bestLikes"] = source["bestLikes"]
        target["coverImage"] = source["coverImage"]
        target["description"] = source["description"]
    all_names = list(target["_allNames"])
    target["name"] = pick_display_name(all_names, target["sources"])


def merge_similar_buckets(buckets: dict[str, dict]) -> tuple[dict[str, dict], int]:
    """Merge places that are substring aliases or share posts with overlapping names."""
    keys = list(buckets.keys())
    parent = {k: k for k in keys}

    def find(k: str) -> str:
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    def names_overlap(ka: str, kb: str) -> bool:
        na, nb = buckets[ka]["name"], buckets[kb]["name"]
        if entities_conflict(detect_location_entities(na), detect_location_entities(nb)):
            return False
        if ka in kb or kb in ka:
            return len(min(ka, kb, key=len)) >= 10
        words_a = {w for w in ka.split() if w not in GENERIC_NAME_TOKENS}
        words_b = {w for w in kb.split() if w not in GENERIC_NAME_TOKENS}
        shared = words_a & words_b
        return len(shared) >= 2 and len(shared) >= min(len(words_a), len(words_b)) - 1

    for i, ka in enumerate(keys):
        ba = buckets[ka]
        for kb in keys[i + 1 :]:
            bb = buckets[kb]
            if is_address_fragment(buckets[ka]["name"]) or is_address_fragment(buckets[kb]["name"]):
                continue
            if ka in kb or kb in ka:
                if len(min(ka, kb, key=len)) >= 10:
                    if not entities_conflict(
                        detect_location_entities(buckets[ka]["name"]),
                        detect_location_entities(buckets[kb]["name"]),
                    ):
                        union(ka, kb)
                continue
            if set(ba["postIds"]) & set(bb["postIds"]) and names_overlap(ka, kb):
                union(ka, kb)

    groups: dict[str, list[str]] = defaultdict(list)
    for k in keys:
        groups[find(k)].append(k)

    merged: dict[str, dict] = {}
    merges = 0
    for group_keys in groups.values():
        if len(group_keys) > 1:
            merges += len(group_keys) - 1
        primary_key = max(group_keys, key=lambda k: (len(k), buckets[k]["totalLikes"]))
        combined = buckets[primary_key].copy()
        combined["states"] = defaultdict(int, dict(combined["states"]))
        combined["categories"] = set(combined["categories"])
        combined["sources"] = set(combined["sources"])
        combined["postIds"] = list(combined["postIds"])
        combined["platforms"] = defaultdict(int, dict(combined.get("platforms", {})))
        combined["_allNames"] = {combined["name"]}
        for other_key in group_keys:
            if other_key == primary_key:
                continue
            merge_bucket_fields(combined, buckets[other_key])
        combined.pop("_allNames", None)
        merged[primary_key] = combined

    return merged, merges


def extract_rule_based(text: str) -> dict[str, tuple[str, str]]:
    found: dict[str, tuple[str, str]] = {}

    for pattern in (PIN_RULE, PIN_SIMPLE):
        for match in pattern.finditer(text):
            add_candidate(found, match.group(1), "pin")

    for match in LOCATED_RULE.finditer(text):
        add_candidate(found, match.group(1), "address")

    for match in JALAN_RULE.finditer(text):
        add_candidate(found, match.group(1), "jalan")

    for match in ENGLISH_VENUE.finditer(text):
        add_candidate(found, match.group(1), "venue")

    for match in HASHTAG_PLACE.finditer(text):
        add_candidate(found, match.group(1), "hashtag")

    return found


def extract_spacy(nlp, text: str, found: dict[str, tuple[str, str]]) -> None:
    text = sanitize_text(text)
    if not text.strip():
        return
    try:
        doc = nlp(text[:5000])
    except (UnicodeError, ValueError):
        return
    for ent in doc.ents:
        if ent.label_ not in NER_LABELS:
            continue
        add_candidate(found, ent.text, "spacy")


def extract_places_from_post(nlp, post: dict, use_spacy: bool) -> list[tuple[str, str]]:
    title = sanitize_text(post.get("title") or "")
    desc = sanitize_text(post.get("description") or "")
    text = f"{title}\n{desc}"

    found = extract_rule_based(text)

    title_match = EXPLORE_TITLE_VENUE.search(title)
    if title_match:
        add_candidate(found, title_match.group(1), "title")

    intro_match = VENUE_BRAND_INTRO.search(desc)
    if intro_match:
        add_candidate(found, intro_match.group(1), "title")

    if use_spacy:
        extract_spacy(nlp, text, found)
    return collapse_extractions_in_post(list(found.values()))


def format_likes_label(score: int) -> str:
    if score >= 10000:
        wan = score / 10000
        label = f"{int(wan)}万+" if wan == int(wan) else f"{wan:.1f}万"
        return f"🔥 {label} likes"
    return f"🔥 {score} likes"


def format_place_id(index: int) -> str:
    return f"P{index:02d}" if index < 100 else f"P{index}"


def stable_place_id(name: str, state: str) -> str:
    """Deterministic ID from place name + state.

    Sequential indexes (P01, P02, ...) reshuffle whenever new posts/states are
    added, which silently re-points saved trips and saved places to the wrong
    place. Hashing the normalized name + state keeps the same ID for the same
    place across re-extracts and re-seeds.
    """
    key = f"{normalize_key(name)}|{(state or 'Malaysia').strip().lower()}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    return f"p_{digest}"


STATE_FROM_TEXT = [
    (re.compile(r"槟城|penang", re.I), "Penang"),
    (re.compile(r"吉隆坡|kuala\s*lumpur|\bkl\b", re.I), "Kuala Lumpur"),
    (re.compile(r"马六甲|melaka|malacca", re.I), "Melaka"),
    (re.compile(r"砂拉越|sarawak|古晋|kuching", re.I), "Sarawak"),
    (
        re.compile(
            r"沙巴|sabah|亚庇|仙本那|kundasang|昆达山|kinabalu|神山|kota\s*kinabalu|\bkk\b",
            re.I,
        ),
        "Sabah",
    ),
    (re.compile(r"彭亨|pahang|金马伦|cameron|genting|云顶", re.I), "Pahang"),
    (re.compile(r"霹雳|perak|怡保|ipoh", re.I), "Perak"),
    (re.compile(r"柔佛|johor|新山", re.I), "Johor"),
    (re.compile(r"雪兰莪|selangor", re.I), "Selangor"),
    (
        re.compile(
            r"登嘉楼|terengganu|瓜拉登嘉楼|kuala\s*terengganu|"
            r"停泊岛|perhentian|热浪岛|redang|雕门|kapas|肯逸|kenyir|"
            r"丁加奴|瓜拉丁加奴|lang\s*tengah",
            re.I,
        ),
        "Terengganu",
    ),
    (
        re.compile(
            r"纳闽岛|labuan\s*island|联邦直辖区.*纳闽|纳闽.*联邦直辖区",
            re.I,
        ),
        "Labuan",
    ),
]

KNOWN_PLACE_STATES = {
    normalize_key("Kundasang"): "Sabah",
    normalize_key("Hounon Ridge Farmstay"): "Sabah",
    normalize_key("Hounon Ridge Farmstay & Camping"): "Sabah",
    normalize_key("Konunukan Garden & Camping Ground"): "Sabah",
    normalize_key("Zing Sunset Bar"): "Sabah",
    normalize_key("pax -Zing Sunset Bar"): "Sabah",
    normalize_key("Kenyir Lake"): "Terengganu",
    normalize_key("Tasik Kenyir"): "Terengganu",
    normalize_key("The Resthouse"): "Terengganu",
    normalize_key("Summerbay Resort"): "Terengganu",
    normalize_key("Pulau Kapas"): "Terengganu",
    normalize_key("Pulau Redang"): "Terengganu",
    normalize_key("Redang Bay Resort"): "Terengganu",
    normalize_key("Taaras Beach Resort"): "Terengganu",
    normalize_key("Lang Tengah"): "Terengganu",
    normalize_key("Pulau Kapas"): "Terengganu",
    normalize_key("Beanswork Superhero Cafe"): "Terengganu",
    normalize_key("Bonsai Art & Restaurant"): "Terengganu",
    normalize_key("Restoran DSH"): "Terengganu",
    normalize_key("One Warison"): "Terengganu",
    normalize_key("Pangkor Laut Resort"): "Perak",
    normalize_key("Pulau Ketam"): "Selangor",
    normalize_key("Pulau Ketam 吉胆岛"): "Selangor",
    normalize_key("Bukit Jelutong Eco Community Park"): "Selangor",
    normalize_key("hyatt recgency kuantan resort"): "Pahang",
    normalize_key("Super Golf Farm Kedah"): "Kedah",
    normalize_key("PASAR KUBANG PASU D1"): "Kedah",
    normalize_key("Kampung Penarik"): "Terengganu",
    normalize_key("Kampung Tengah"): "Terengganu",
    normalize_key("Labuan Island"): "Labuan",
    normalize_key("纳闽岛"): "Labuan",
}


def infer_state_from_text(*parts: str) -> str | None:
    text = " ".join(p for p in parts if p)
    for pattern, state in STATE_FROM_TEXT:
        if pattern.search(text):
            return state
    return None


def infer_post_state(post: dict) -> str:
    text = " ".join(
        str(post.get(k) or "")
        for k in ("sourceKeyword", "location", "title", "description")
    )
    if re.search(r"labuan\s*bajo|纳闽巴霍", text, re.I):
        return "Indonesia"
    from_text = infer_state_from_text(
        post.get("sourceKeyword") or "",
        post.get("location") or "",
        post.get("title") or "",
        post.get("description") or "",
    )
    if from_text:
        return from_text
    state = str(post.get("state") or "Malaysia").strip()
    return state if state else "Malaysia"


def resolve_place_state(name: str, bucket_states: dict[str, int]) -> str:
    name_key = normalize_key(name)
    if name_key in KNOWN_PLACE_STATES:
        return KNOWN_PLACE_STATES[name_key]
    from_name = infer_state_from_text(name)
    if from_name:
        return from_name
    if bucket_states:
        return max(bucket_states.items(), key=lambda x: x[1])[0]
    return "Malaysia"


def build_places(posts: list[dict], nlp, use_spacy: bool) -> tuple[list[dict], dict]:
    post_by_id = {str(p.get("id")): p for p in posts if p.get("id")}
    buckets: dict[str, dict] = defaultdict(
        lambda: {
            "name": "",
            "states": defaultdict(int),
            "categories": set(),
            "totalLikes": 0,
            "totalCollected": 0,
            "postIds": [],
            "coverImage": None,
            "bestLikes": -1,
            "description": "",
            "sources": set(),
            "platforms": defaultdict(int),
        }
    )

    posts_with_places = 0
    total_mentions = 0
    by_source: dict[str, int] = defaultdict(int)
    skipped_non_malaysia = 0

    for post in posts:
        if not is_malaysia_post(post):
            skipped_non_malaysia += 1
            continue
        if is_promotional_post(post):
            continue
        if is_festival_post(post):
            continue
        extracted = extract_places_from_post(nlp, post, use_spacy)
        if not extracted:
            continue
        posts_with_places += 1
        likes = int(post.get("likesScore") or 0)
        collected = int(re.sub(r"\D", "", str(post.get("collected") or "0")) or 0)
        state = infer_post_state(post)
        categories = post.get("categories") or []
        image = post.get("image")
        snippet = (post.get("description") or post.get("title") or "")[:160]

        seen_in_post: set[str] = set()
        for name, source in extracted:
            final_name = finalize_display_name(name)
            if not final_name:
                continue
            key = normalize_key(final_name)
            if key in seen_in_post:
                continue
            seen_in_post.add(key)
            total_mentions += 1
            by_source[source] += 1

            bucket = buckets[key]
            bucket["name"] = final_name
            bucket["states"][state] += 1
            bucket["categories"].update(categories)
            bucket["sources"].add(source)
            platform = str(post.get("platform") or "xhs")
            bucket["platforms"][platform] += 1
            bucket["totalLikes"] += likes
            bucket["totalCollected"] += collected
            if post.get("id") and post["id"] not in bucket["postIds"]:
                if post_relevant_to_place(post, final_name, state):
                    bucket["postIds"].append(post["id"])
            if likes > bucket["bestLikes"]:
                bucket["bestLikes"] = likes
                bucket["coverImage"] = image
                bucket["description"] = snippet

    buckets, merge_count = merge_similar_buckets(dict(buckets))

    ranked = sorted(
        buckets.values(),
        key=lambda p: (p["totalLikes"], len(p["postIds"])),
        reverse=True,
    )
    places: list[dict] = []
    used_ids: dict[str, int] = {}

    for i, bucket in enumerate(ranked, start=1):
        if not bucket["coverImage"] or len(bucket["postIds"]) < 1:
            continue
        if is_address_fragment(bucket["name"]):
            continue
        if not passes_output_quality(bucket["name"]):
            continue
        if is_festival_name(bucket["name"]):
            continue
        if len(bucket["name"]) < 3:
            continue
        state = resolve_place_state(bucket["name"], dict(bucket["states"]))
        filtered_post_ids = [
            pid
            for pid in bucket["postIds"]
            if pid in post_by_id and post_relevant_to_place(post_by_id[pid], bucket["name"], state)
        ]
        if not filtered_post_ids:
            continue

        best_likes = -1
        cover_image = bucket["coverImage"]
        description = bucket["description"]
        filtered_likes = 0
        filtered_collected = 0
        for pid in filtered_post_ids:
            post = post_by_id[pid]
            likes = int(post.get("likesScore") or 0)
            filtered_likes += likes
            filtered_collected += int(re.sub(r"\D", "", str(post.get("collected") or "0")) or 0)
            if likes > best_likes:
                best_likes = likes
                if post.get("image"):
                    cover_image = post["image"]
                description = (post.get("description") or post.get("title") or "")[:160]

        likes_score = filtered_likes or bucket["totalLikes"]
        platforms = defaultdict(int)
        for pid in filtered_post_ids:
            platform = str(post_by_id[pid].get("platform") or "xhs")
            platforms[platform] += 1
        primary_platform = max(platforms.items(), key=lambda x: x[1])[0] if platforms else "xhs"
        place_id = stable_place_id(bucket["name"], state)
        if place_id in used_ids:
            used_ids[place_id] += 1
            place_id = f"{place_id}-{used_ids[place_id]}"
        else:
            used_ids[place_id] = 0
        places.append(
            {
                "_id": place_id,
                "name": bucket["name"],
                "state": state,
                "categories": infer_place_categories(
                    bucket["name"],
                    bucket["categories"],
                ),
                "totalLikes": likes_score,
                "likesLabel": format_likes_label(likes_score),
                "totalCollected": filtered_collected or bucket["totalCollected"],
                "postCount": len(filtered_post_ids),
                "coverImage": cover_image,
                "description": description,
                "postIds": filtered_post_ids,
                "extractSources": sorted(bucket["sources"]),
                "primaryPlatform": primary_platform,
                "platforms": dict(platforms),
            }
        )

    stats = {
        "postsProcessed": len(posts),
        "postsSkippedNonMalaysia": skipped_non_malaysia,
        "postsWithPlaces": posts_with_places,
        "placeMentions": total_mentions,
        "duplicateBucketsMerged": merge_count,
        "uniquePlaces": len(places),
        "mentionsBySource": dict(by_source),
    }
    return places, stats


DISPLAY_NAME_OVERRIDES = {
    normalize_key("Break Break Bar"): "Dré Coklat",
    normalize_key("Hounon Ridge Farmstay & Camping"): "Hounon Ridge Farmstay",
    normalize_key("pax -Zing Sunset Bar"): "Zing Sunset Bar",
    normalize_key("【Pulau Kapas】"): "Pulau Kapas",
    normalize_key("【Tokku】"): "Tokku",
    normalize_key("Restoran DSH Jalan Pantai Batu Buruk"): "Restoran DSH",
    normalize_key("One Warison 炭烧瓦煲鸡饭 Jln Pesisir Payang"): "One Warison",
    normalize_key("One Warison 炭烧瓦煲鸡饭"): "One Warison",
    normalize_key("停泊岛的珊瑚湾Coral Bay 房源名字"): "Coral Bay",
    normalize_key("就在登嘉楼的《Beanswork Superhero Cafe》 店里"): "Beanswork Superhero Cafe",
    normalize_key("Kuala Terengganu《Bonsai Art & Resta"): "Bonsai Art & Restaurant",
    normalize_key("T-Homemade Cafe 登"): "T Homemade Cafe",
    normalize_key("hyatt recgency kuantan resort"): "Hyatt Regency Kuantan Resort",
    normalize_key("比马尔代夫少3倍"): "Pulau Aur",
    normalize_key("Kota Kinabalu 亚庇 追逐全球TOP3的日落～ 丹绒亚路海滩"): "Tanjung Aru Beach",
    normalize_key("Aurelia"): "Aurelia Café",
    normalize_key("Red Sky Casual Dining & Cocktails"): "Red Sky Restaurant & Bar",
    normalize_key("Red Sky Restaurant & Bar"): "Red Sky Restaurant & Bar",
    normalize_key("(星期一休息） 地址"): "Football Western",
    normalize_key("Alva KL ( Level"): "Alva KL",
    normalize_key("秋千就在Kausar餐厅旁边"): "Le Cruise de Kausar",
    normalize_key("日记 #seremban"): "CHAGEE Drive-Thru Seremban 2",
    normalize_key("日记 #美食探店"): "Teck Teh Bak Kut Teh",
    normalize_key("Sulap II homestay 的周围"): "Sulap II",
    normalize_key("泰国餐厅"): "A'Han Thai Seafood",
    normalize_key("水上餐厅"): "A'Han Thai Seafood",
    normalize_key("海景咖啡"): "Oceano Symphony",
    normalize_key("机位 从klcc大门出来"): "KLCC Park",
    normalize_key("Taxi 车头鸭蛋炒粿条 口感"): "Taxi 车头鸭蛋炒粿条",
    normalize_key("Sudo Bakery 【2A-G"): "Sudo Bakery",
    normalize_key("Seri Edaran Light Industrial Park"): "Dong Tai Kopitiam Kepong",
    normalize_key("BBCC"): "LaLaport BBCC",
    normalize_key("路边叹ABC"): "Lubiantan ABC · Yulek",
    normalize_key("No 8 Kedai Pij"): "Warong Dessert",
    normalize_key("一元早餐店 One Dollar Shop"): "One Dollar Breakfast Shop",
    normalize_key("Sepang Bay"): "Sepang Bay 13",
    normalize_key("Paya Indah Discovery Wetlands (Gate 1)"): "Paya Indah Discovery Wetlands",
    normalize_key("DISCOVERY PARK"): "Paya Indah Discovery Wetlands",
    normalize_key("Kea Farm"): "Kea Farm Market",
    normalize_key("Genting Highlands"): "Antara Signature Mall",
    normalize_key("Spazzo artisanal fresh pasta"): "Spazzo Artisanal Fresh Pasta",
    normalize_key("Nine Emperor Gods Temple"): "Tow Boo Kong Temple",
    normalize_key("Tow Boo Kong Temple (北海斗母宫)"): "Tow Boo Kong Temple",
    normalize_key("Foon Yew Laksa (JB)"): "Foon Yew Laksa",
    normalize_key("Vanavasa Resort"): "VanaVasa Resort Janda Baik",
    normalize_key("villange park"): "Village Park Restaurant",
    normalize_key("Ghostbird Coffee"): "Ghostbird Coffee Company",
    normalize_key("【Chialee Bakery】 No."): "Chialee Bakery",
    normalize_key("Menara Exchange106"): "The Exchange 106 @ TRX",
    normalize_key("Tamarind Bldg Rd"): "Tamarind Square",
    normalize_key("Pan'gaea"): "Paragon @ Pan'gaea",
    normalize_key("Pan’gaea"): "Paragon @ Pan'gaea",
    normalize_key("Vietnamese Coffee"): "Kafe Kleptokrat",
}


# Manually curated cover images (survive re-extraction).
CURATED_COVERS = {
    normalize_key("半山芭巴刹"): "/places/P01.png",
    normalize_key("Hounon Ridge Farmstay"): "/places/Hounon Ridge Farmstay Sabah.jpg",
    normalize_key("Hounon Ridge Farmstay & Camping"): "/places/Hounon Ridge Farmstay Sabah.jpg",
    normalize_key("Kundasang"): "/places/Kudasang.jpg",
    normalize_key("Zing Sunset Bar"): "/places/Zing Sunset Bar.jpg",
    normalize_key("Genting Lifestyle /Next Gen Gaming"): "/places/nextgen genting.jpeg",
    normalize_key("Next Gen Gaming"): "/places/nextgen genting.jpeg",
    normalize_key("Skybar"): "/places/Sky Bar.png",
    normalize_key("Tanjung Aru Beach"): "/places/Tanjung Aru Beach.jpeg",
    normalize_key("Taman Connaught Night Market"): "/places/Taman Connaught Night Market.jpeg",
    normalize_key("TG's Bistro"): "/places/TG Bistro.jpeg",
    normalize_key("Tanah Aina Farrah Soraya"): "/places/Tanah Aina Farrah Soraya.jpeg",
    normalize_key("Starus Hotel"): "/places/Starus Hotel.jpg",
    normalize_key("EnerG x Park"): "/places/EnerG x Park.jpeg",
    normalize_key("Mohammad Chow Chinese Muslim Kitchen"): "/places/Mohammad Chow Chinese Muslim Kitchen.jpeg",
    normalize_key("MUSE Peranakan Bistro"): "/places/Muse Peranakan Bistro.png",
    normalize_key("Football Western"): "/places/Western Football.png",
    normalize_key("Outfall Sungai Batu Feringghi"): "/places/Outfall Sungai Batu Ferringhi.jpeg",
    normalize_key("Kenyir Lake"): "/places/Kenyir Lake.jpg",
    normalize_key("Yuan Hub Jinjang"): "/places/Yuan Hub JinJang.png",
    normalize_key("Putra Mosque"): "/places/Putra Mosque.jpeg",
    normalize_key("Chasing Sunset Cafe"): "/places/Chasing Sunset Cafe.jpeg",
    normalize_key("Chasing Sunsets Cafe"): "/places/Chasing Sunset Cafe.jpeg",
    normalize_key("Desa Dairy Farm"): "/places/Desa Dairy Farm.jpg",
    normalize_key("August Healing"): "/places/August Healing.jpg",
    normalize_key("Gopeng Glamping Park"): "/places/Gopeng Glamping Park.jpeg",
    normalize_key("Bukit Jelutong Eco Community Park"): "/places/Bukit Jelutong Eco Community Park.jpeg",
    normalize_key("Kelab Tasik Putrajaya"): "/places/Kelab Tasik Putrajaya.jpeg",
    normalize_key("Laman Perdana Botanical Garden"): "/places/Laman Perdana Botanical Garden.jpeg",
    normalize_key("Sudo Bakery"): "/places/Sudo Bakery.jpg",
    normalize_key("Perhentian"): "/places/Perhentian.jpg",
    normalize_key("light capture cafe"): "/places/light capture cafe.jpg",
    normalize_key("Oceano Symphony"): "/places/Ocean Symphony.jpeg",
    normalize_key("Ocean Symphony"): "/places/Ocean Symphony.jpeg",
    normalize_key("LEGOLAND Malaysia"): "/places/Legoland.jpg",
    normalize_key("Le Cruise de Kausar"): "/places/Le Cruise de Kausar.jpeg",
    normalize_key("Sunway Resort Hotel"): "/places/Sunway Resort Hotel.jpg",
    normalize_key("Hard Rock Hotel"): "/places/Hard Rock Hotel.jpg",
    normalize_key("Aurelia"): "/places/Aurelia Café.jpg",
    normalize_key("Aurelia Café"): "/places/Aurelia Café.jpg",
    normalize_key("Gamuda Cove"): "/places/Gamuda Cove.png",
    normalize_key("Village Park Restaurant"): "/places/Village Park.jpeg",
    normalize_key("Red Sky Restaurant & Bar"): "/places/Red Sky Restaurant & Bar.jpg",
    normalize_key("Red Sky Casual Dining & Cocktails"): "/places/Red Sky Restaurant & Bar.jpg",
    normalize_key("布秧谷博物馆"): "/places/Buyang Valley Museum.jpg",
    normalize_key("Billion Onsen"): "/places/Billion Onsen.jpg",
    normalize_key("Northam Beach Cafe"): "/places/Northam Beach Cafe.jpeg",
    normalize_key("Teck Teh Bak Kut Teh"): "/places/Teck Teh Bak Kut Teh.jpg",
    normalize_key("Dong Tai Kopitiam Kepong"): "/places/Dong Tai Kopitiam Kepong.jpg",
    normalize_key("LaLaport BBCC"): "/places/LaLaport BBCC.jpg",
    normalize_key("Immersify Kuala Lumpur"): "/places/Immersify Kuala Lumpur.jpeg",
    normalize_key("Ekues Cabin Cafe"): "/places/Ekues Cabin Cafe.png",
    normalize_key("Afiq burger ppr"): "/places/Afiq burger ppr.jpg",
    normalize_key("1 Utama Shopping Centre"): "/places/1 Utama Shopping Centre.jpg",
    normalize_key("Warung Bunian"): "/places/Warung Bunian.jpg",
    normalize_key("Stellar cafe"): "/places/Stellar cafe.jpg",
    normalize_key("Kopi Village 24 Gombak"): "/places/Kopi Village 24 Gombak.jpg",
    normalize_key("Aegean Blue Restaurant"): "/places/Aegean Blue Restaurant.jpg",
    normalize_key("Warong Dessert"): "/places/Warong Dessert.jpg",
    normalize_key("One Dollar Breakfast Shop"): "/places/One Dollar Breakfast Shop.jpg",
    normalize_key("A'Han Thai Seafood"): "/places/A'Han Thai Seafood.jpeg",
    normalize_key("Katsetiu"): "/places/Katsetiu.jpg",
    normalize_key("Kopi & Keju"): "/places/Kopi & Keju.jpeg",
    normalize_key("Terminal Sekinchan"): "/places/Terminal Sekinchan.png",
    normalize_key("ZEN By Stellar Cameron"): "/places/ZEN By Stellar Cameron.jpg",
    normalize_key("Zen by Stellar"): "/places/ZEN By Stellar Cameron.jpg",
    normalize_key("Sulap II"): "/places/Sulap II.jpeg",
}


def load_persisted_name_overrides() -> dict[str, str]:
    """Hardcoded overrides + names cleaned by clean-places (persisted), so a
    re-extraction keeps the tidy display names instead of reverting to captions."""
    table = {normalize_key(k): v for k, v in DISPLAY_NAME_OVERRIDES.items()}
    if NAME_OVERRIDE_STORE.exists():
        try:
            data = json.loads(NAME_OVERRIDE_STORE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, str) and value:
                    table[normalize_key(key)] = value
    return table


def apply_display_overrides(places: list[dict], overrides: dict[str, str] | None = None) -> None:
    table = overrides if overrides is not None else {
        normalize_key(k): v for k, v in DISPLAY_NAME_OVERRIDES.items()
    }
    for place in places:
        override = table.get(normalize_key(place["name"]))
        if override:
            place["name"] = override


def load_preserved_google_states() -> dict[str, dict]:
    """Keep the authoritative Google-derived state across re-extraction so the
    --google pass only has to look up NEW places, not all of them again."""
    states: dict[str, dict] = {}
    if not PLACES_OUT.exists():
        return states
    try:
        existing = json.loads(PLACES_OUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return states
    for place in existing:
        gstate = place.get("googleState")
        if not gstate:
            continue
        states[normalize_key(place.get("name", ""))] = {
            "googleState": gstate,
            "googleFormattedAddress": place.get("googleFormattedAddress"),
        }
    return states


def apply_preserved_google_states(places: list[dict], states: dict[str, dict]) -> None:
    for place in places:
        entry = states.get(normalize_key(place["name"]))
        if not entry:
            continue
        place["googleState"] = entry["googleState"]
        place["state"] = entry["googleState"]  # keep the verified state
        if entry.get("googleFormattedAddress"):
            place["googleFormattedAddress"] = entry["googleFormattedAddress"]


def load_preserved_covers() -> dict[str, str]:
    """Keep manually curated local cover images across re-extraction."""
    covers = dict(CURATED_COVERS)
    if not PLACES_OUT.exists():
        return covers
    try:
        existing = json.loads(PLACES_OUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return covers
    for place in existing:
        cover = place.get("coverImage") or ""
        if not cover.startswith("/places/"):
            continue
        name_key = normalize_key(place.get("name", ""))
        if name_key and name_key not in covers:
            covers[name_key] = cover
    return covers


GOOGLE_PRESERVE_FIELDS = (
    "googlePlaceId",
    "googleRating",
    "googleReviewCount",
    "openingHours",
    "googleMapsUri",
    "googleDescription",
    "googleEnrichedAt",
    "googleState",
    "googleFormattedAddress",
)


def has_google_enrichment(place: dict) -> bool:
    if not place:
        return False
    if place.get("googleEnrichedAt"):
        return True
    if place.get("googlePlaceId"):
        return True
    if place.get("googleRating") is not None:
        return True
    hours = place.get("openingHours")
    if isinstance(hours, list) and len(hours) > 0:
        return True
    return False


def enrichment_key(name: str, state: str) -> str:
    return f"{normalize_key(name)}|{(state or 'Malaysia').strip()}"


def load_persisted_name_override_aliases() -> dict[str, list[str]]:
    """canonical name (lower) -> [old alias names lower]"""
    aliases: dict[str, list[str]] = defaultdict(list)
    table = {normalize_key(k): v for k, v in DISPLAY_NAME_OVERRIDES.items()}
    if NAME_OVERRIDE_STORE.exists():
        try:
            data = json.loads(NAME_OVERRIDE_STORE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for k, v in data.items():
                    table[normalize_key(k)] = str(v)
        except (json.JSONDecodeError, OSError):
            pass
    for old_key, new_name in table.items():
        canonical = normalize_key(new_name)
        if old_key and canonical and old_key != canonical:
            aliases[canonical].append(old_key)
    return dict(aliases)


def load_preserved_google() -> dict[str, dict]:
    preserved: dict[str, dict] = {}

    if PLACES_OUT.exists():
        try:
            existing = json.loads(PLACES_OUT.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = []
        for place in existing:
            if not has_google_enrichment(place):
                continue
            key = enrichment_key(place.get("name", ""), place.get("state", "Malaysia"))
            preserved[key] = {k: place[k] for k in GOOGLE_PRESERVE_FIELDS if k in place}

    if GOOGLE_ENRICHMENT_STORE.exists():
        try:
            store = json.loads(GOOGLE_ENRICHMENT_STORE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            store = {}
        if isinstance(store, dict):
            for key, data in store.items():
                if not isinstance(data, dict) or not has_google_enrichment(data):
                    continue
                if key not in preserved:
                    preserved[key] = {k: data[k] for k in GOOGLE_PRESERVE_FIELDS if k in data}

    return preserved


def apply_preserved_google(places: list[dict], preserved: dict[str, dict]) -> None:
    aliases = load_persisted_name_override_aliases()
    for place in places:
        keys = [enrichment_key(place["name"], place.get("state", "Malaysia"))]
        for alias in aliases.get(normalize_key(place["name"]), []):
            keys.append(enrichment_key(alias, place.get("state", "Malaysia")))
        extra = preserved.get(normalize_key(place["name"]))
        if not extra:
            for key in keys:
                extra = preserved.get(key)
                if extra:
                    break
        if extra:
            place.update(extra)


def save_google_enrichment_store(places: list[dict]) -> None:
    store: dict[str, dict] = {}
    if GOOGLE_ENRICHMENT_STORE.exists():
        try:
            existing = json.loads(GOOGLE_ENRICHMENT_STORE.read_text(encoding="utf-8"))
            if isinstance(existing, dict):
                store = existing
        except (json.JSONDecodeError, OSError):
            store = {}
    for place in places:
        if not has_google_enrichment(place):
            continue
        key = enrichment_key(place["name"], place.get("state", "Malaysia"))
        entry = {k: place[k] for k in GOOGLE_PRESERVE_FIELDS if k in place}
        if not entry.get("googleEnrichedAt"):
            entry["googleEnrichedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        prev = store.get(key)
        if prev:
            entry = {**prev, **{k: v for k, v in entry.items() if v is not None}}
        store[key] = entry
        for alias in load_persisted_name_override_aliases().get(normalize_key(place["name"]), []):
            store[enrichment_key(alias, place.get("state", "Malaysia"))] = dict(store[key])
    GOOGLE_ENRICHMENT_STORE.write_text(
        json.dumps(dict(sorted(store.items())), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def apply_preserved_covers(places: list[dict], covers: dict[str, str]) -> None:
    for place in places:
        name_key = normalize_key(place["name"])
        local = covers.get(name_key)
        if not local and "hounon ridge" in name_key:
            local = covers.get("hounon ridge farmstay & camping") or covers.get("hounon ridge farmstay")
        if local:
            place["coverImage"] = local


LOCATION_PRESERVE_KEYS = (
    "state",
    "googleState",
    "googleFormattedAddress",
    *GOOGLE_PRESERVE_FIELDS,
    "locationIds",
)


PLACE_NAME_CATEGORY_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "NATURE",
        re.compile(
            r"beach|waterfall|falls|forest|mountain|gunung|pulau|island|lake|river|"
            r"rainforest|trail|hike|sanctuary|wildlife|tanjung|pantai|tasik|cave|"
            r"highlands| kinabalu|national\s+park|eco\s+park|marine\s+park",
            re.I,
        ),
    ),
    (
        "FOOD",
        re.compile(
            r"restaurant|restoran|cafe|caf[eé]|coffee|bistro|warung|kopitiam|mamak|"
            r"bakery|food\s+court|dim\s*sum|steamboat|bbq|skybar|\bbar\b|pub|"
            r"rooftop|night\s+market|pasar|hawker|satay|laksa|肉骨|"
            r"巴刹|美食|炒|档口",
            re.I,
        ),
    ),
    (
        "STAY",
        re.compile(r"hotel|resort|homestay|hostel|\binn\b|suites|lodging|guesthouse|chalet", re.I),
    ),
    (
        "ADVENTURE",
        re.compile(
            r"adventure|zipline|rafting|diving|snorkel|climb|glamping|camping|"
            r"skydive|paragliding|atv|theme\s+park|water\s+park|sky\s*div|"
            r"parasail|bungee|via\s+ferrata|legoland|sunway\s+lagoon|"
            r"lost\s+world|escape\s+park|escape\s+room",
            re.I,
        ),
    ),
    (
        "CULTURE",
        re.compile(
            r"museum|mosque|masjid|templ|heritage|church|fort|palace|gallery|"
            r"monument|cultural|chinatown|peranakan|street\s+art|"
            r"clock\s+tower|independence\s+square|art\s+center|art\s+centre|"
            r"friendship\s+garden|japanese\s+garden|japan.*garden",
            re.I,
        ),
    ),
    (
        "HIDDEN GEMS",
        re.compile(r"hidden|secret|off.?beat|underrated|秘境|小众", re.I),
    ),
]

HOTEL_NAME_RE = re.compile(r"hotel|resort|homestay|hostel|\binn\b|suites", re.I)
FOOD_VENUE_NAME_RE = re.compile(
    r"bar|restaurant|restoran|cafe|caf[eé]|bistro|kitchen|dining|skybar|warung|"
    r"mamak|kopitiam|food|pasar|market|bakery|satay|肉骨|巴刹",
    re.I,
)


def infer_place_categories(
    name: str,
    post_categories: set[str] | list[str] | None = None,
    google_description: str = "",
) -> list[str]:
    """Infer visit categories from place name (primary) and Google blurb, not post hashtags."""
    post_categories = set(post_categories or ())
    text = f"{name} {google_description or ''}".strip()
    matched: set[str] = set()
    for cat_id, pattern in PLACE_NAME_CATEGORY_RULES:
        if pattern.search(text):
            matched.add(cat_id)

    if HOTEL_NAME_RE.search(name) and not FOOD_VENUE_NAME_RE.search(name):
        matched.discard("FOOD")
        matched.add("STAY")

    if not matched:
        cleaned_posts = set(post_categories)
        if HOTEL_NAME_RE.search(name):
            cleaned_posts.discard("FOOD")
        matched = cleaned_posts or {"CULTURE"}

    if matched == {"FOOD"} and HOTEL_NAME_RE.search(name) and not FOOD_VENUE_NAME_RE.search(name):
        matched = {"STAY"}

    return sorted(matched)[:3]


def recategorize_places_file() -> tuple[int, int]:
    """Re-infer categories for every row in places.json (preserves other fields)."""
    places = json.loads(PLACES_OUT.read_text(encoding="utf-8"))
    changed = 0
    for place in places:
        old = place.get("categories") or []
        new = infer_place_categories(
            place.get("name") or "",
            old,
            place.get("googleDescription") or "",
        )
        if old != new:
            place["categories"] = new
            changed += 1
    PLACES_OUT.write_text(
        json.dumps(places, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return changed, len(places)


def recalculate_place_from_posts(place: dict, post_ids: list[str], post_by_id: dict[str, dict]) -> None:
    """Recompute engagement fields from the union of linked post IDs."""
    platforms: dict[str, int] = defaultdict(int)
    sources: set[str] = set(place.get("extractSources") or [])
    categories: set[str] = set(place.get("categories") or [])
    total_likes = 0
    total_collected = 0
    best_likes = -1
    cover_image = place.get("coverImage")
    description = place.get("description") or ""

    for pid in post_ids:
        post = post_by_id.get(pid)
        if not post:
            continue
        likes = int(post.get("likesScore") or 0)
        total_likes += likes
        total_collected += int(re.sub(r"\D", "", str(post.get("collected") or "0")) or 0)
        platform = str(post.get("platform") or "xhs")
        platforms[platform] += 1
        categories.update(post.get("categories") or [])
        if likes > best_likes:
            best_likes = likes
            if post.get("image") and not str(place.get("coverImage") or "").startswith("/places/"):
                cover_image = post["image"]
            description = (post.get("description") or post.get("title") or "")[:160]

    place["postIds"] = post_ids
    place["postCount"] = len(post_ids)
    place["totalLikes"] = total_likes
    place["likesLabel"] = format_likes_label(total_likes)
    place["totalCollected"] = total_collected
    if cover_image:
        place["coverImage"] = cover_image
    if description:
        place["description"] = description
    place["categories"] = infer_place_categories(
        place.get("name") or "",
        categories,
        place.get("googleDescription") or "",
    )
    place["extractSources"] = sorted(sources)
    if platforms:
        place["platforms"] = dict(platforms)
        place["primaryPlatform"] = max(platforms.items(), key=lambda x: x[1])[0]


def merge_places_incremental(
    existing: list[dict],
    incoming: list[dict],
    post_by_id: dict[str, dict],
) -> tuple[list[dict], dict]:
    """Add places from a new import batch without overwriting verified location fields."""
    by_id: dict[str, dict] = {p["_id"]: dict(p) for p in existing}
    by_name: dict[str, str] = {normalize_key(p["name"]): p["_id"] for p in existing if p.get("name")}

    added = 0
    merged = 0
    skipped = 0

    for new_place in incoming:
        name_key = normalize_key(new_place.get("name", ""))
        if not name_key:
            skipped += 1
            continue

        target_id = by_name.get(name_key)
        if target_id and target_id in by_id:
            base = by_id[target_id]
            merged_ids = list(dict.fromkeys([*(base.get("postIds") or []), *(new_place.get("postIds") or [])]))
            for src in new_place.get("extractSources") or []:
                if src not in (base.get("extractSources") or []):
                    base.setdefault("extractSources", []).append(src)
            base["extractSources"] = sorted(set(base.get("extractSources") or []))
            recalculate_place_from_posts(base, merged_ids, post_by_id)
            merged += 1
            continue

        place_id = new_place["_id"]
        if place_id in by_id:
            base = by_id[place_id]
            merged_ids = list(dict.fromkeys([*(base.get("postIds") or []), *(new_place.get("postIds") or [])]))
            recalculate_place_from_posts(base, merged_ids, post_by_id)
            merged += 1
            continue

        by_id[place_id] = new_place
        by_name[name_key] = place_id
        added += 1

    merged_places = sorted(
        by_id.values(),
        key=lambda p: (p.get("totalLikes", 0), p.get("postCount", 0)),
        reverse=True,
    )
    return merged_places, {"added": added, "merged": merged, "skipped": skipped, "total": len(merged_places)}


def filter_posts(posts: list[dict], *, platform: str | None, batches: set[str]) -> list[dict]:
    filtered = []
    for post in posts:
        if platform and post.get("platform") != platform:
            continue
        if batches and str(post.get("batch") or "").lower() not in batches:
            continue
        filtered.append(post)
    return filtered


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract specific places from merged RedNote posts")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N posts (0 = all)")
    parser.add_argument("--platform", default="", help="Only process posts from this platform (e.g. dy)")
    parser.add_argument(
        "--batches",
        default="",
        help="Comma-separated batch labels to process (e.g. pahang,perlis,sabah)",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Merge new places into existing places.json without overwriting verified location fields",
    )
    parser.add_argument("--model", default="zh_core_web_sm", help="spaCy Chinese model")
    parser.add_argument(
        "--use-spacy",
        action="store_true",
        help="Enable spaCy FAC/ORG extraction (off by default for higher precision)",
    )
    parser.add_argument(
        "--recategorize-only",
        action="store_true",
        help="Re-infer categories on existing places.json (no NLP re-extraction)",
    )
    args = parser.parse_args()

    if args.recategorize_only:
        if not PLACES_OUT.exists():
            print(f"Missing {PLACES_OUT}", file=sys.stderr)
            return 1
        changed, total = recategorize_places_file()
        print(f"Recategorized {changed}/{total} places in {PLACES_OUT}")
        return 0

    if not MERGED_DATA.exists():
        print(f"Missing {MERGED_DATA}. Run: cd server && npm run import:trending", file=sys.stderr)
        return 1

    nlp = None
    if args.use_spacy:
        import spacy

        print(f"Loading spaCy model: {args.model}")
        try:
            nlp = spacy.load(args.model)
        except OSError:
            print(
                f"Model '{args.model}' not found. Run:\n"
                f"  python -m spacy download {args.model}",
                file=sys.stderr,
            )
            return 1

    posts = json.loads(MERGED_DATA.read_text(encoding="utf-8"))
    batch_set = {b.strip().lower() for b in args.batches.split(",") if b.strip()}
    platform = args.platform.strip() or None

    if args.merge and not PLACES_OUT.exists():
        print(f"Missing {PLACES_OUT} for --merge", file=sys.stderr)
        return 1
    if args.merge and not batch_set:
        print("--merge requires --batches (incremental import only)", file=sys.stderr)
        return 1

    if batch_set or platform:
        posts = filter_posts(posts, platform=platform, batches=batch_set)
        scope = []
        if platform:
            scope.append(f"platform={platform}")
        if batch_set:
            scope.append(f"batches={','.join(sorted(batch_set))}")
        print(f"Filtered to {len(posts)} posts ({', '.join(scope)})")

    if args.limit > 0:
        posts = posts[: args.limit]
        print(f"Processing first {len(posts)} posts (--limit)")

    print(f"Extracting specific places from {len(posts)} posts...")
    # These read the existing places.json / stores BEFORE it is overwritten.
    preserved_covers = load_preserved_covers()
    preserved_google = load_preserved_google()
    name_overrides = load_persisted_name_overrides()
    preserved_google_states = load_preserved_google_states()

    existing_places: list[dict] = []
    if args.merge:
        existing_places = json.loads(PLACES_OUT.read_text(encoding="utf-8"))
        print(f"Merging into {len(existing_places)} existing places")

    post_by_id = {str(p.get("id")): p for p in json.loads(MERGED_DATA.read_text(encoding="utf-8")) if p.get("id")}

    new_places, stats = build_places(posts, nlp, args.use_spacy)
    apply_display_overrides(new_places, name_overrides)
    apply_preserved_covers(new_places, preserved_covers)
    apply_preserved_google(new_places, preserved_google)
    apply_preserved_google_states(new_places, preserved_google_states)

    if args.merge:
        places, merge_stats = merge_places_incremental(existing_places, new_places, post_by_id)
        stats["merge"] = merge_stats
        print(
            f"Merge: +{merge_stats['added']} new, {merge_stats['merged']} updated, "
            f"{merge_stats['total']} total places"
        )
    else:
        places = new_places

    # Re-apply saved Google ratings/hours to the full list (existing + new).
    apply_preserved_google(places, preserved_google)
    apply_preserved_google_states(places, preserved_google_states)

    save_google_enrichment_store(places)
    enriched_count = sum(1 for p in places if has_google_enrichment(p))
    print(f"Preserved Google enrichment on {enriched_count} places")
    print(f"Preserved Google state on {sum(1 for p in places if p.get('googleState'))} places")

    PLACES_OUT.write_text(json.dumps(places, ensure_ascii=False, indent=2), encoding="utf-8")
    STATS_OUT.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(places)} places -> {PLACES_OUT}")
    print(f"Stats: {stats['postsWithPlaces']}/{stats['postsProcessed']} posts had places")
    if stats.get("duplicateBucketsMerged"):
        print(f"Merged {stats['duplicateBucketsMerged']} duplicate place buckets")
    print(f"Sources: {stats.get('mentionsBySource', {})}")
    print("Top 5 by likes:")
    for place in places[:5]:
        line = f"  {place['_id']} {place['name']} ({place['state']}) - {place['totalLikes']} likes, {place['postCount']} posts"
        print(line.encode("ascii", errors="replace").decode("ascii"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
