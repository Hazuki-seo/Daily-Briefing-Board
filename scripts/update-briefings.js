const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCSV, toCSV } = require('./csv-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BRIEFINGS_PATH = path.join(DATA_DIR, 'briefings.csv');
const COMMENTS_PATH = path.join(DATA_DIR, 'comments.csv');
const TOPIC_WEIGHTS_PATH = path.join(DATA_DIR, 'topic_weights.csv');
const SOURCES_PATH = path.join(DATA_DIR, 'sources.json');

const BRIEFING_HEADERS = [
  'date',
  'id',
  'section',
  'category',
  'source_name',
  'published_date',
  'event_date',
  'location',
  'actor',
  'title',
  'summary',
  'source_url',
  'source_image_url',
  'image_caption',
  'what_happened',
  'background',
  'watch_point',
  'work_hint',
  'importance'
];

const CATEGORY_KEYWORDS = {
  'AI・テック': ['AI', '人工知能', '生成AI', 'LLM', 'OpenAI', 'NVIDIA', 'GPU', 'ロボット', 'robot', 'robotics', 'フィジカルAI', 'physical AI', 'エージェント', 'agent', '半導体', 'データセンター', '機械学習', '業務自動化', '企業導入', '法人向け'],
  '印刷・製造業': ['製造', 'ものづくり', '工場', '生産', 'スマートファクトリー', '設備', '保全', '自動化', '省人', 'ロボット', '印刷', 'プリント', 'デジタル印刷', 'DTF', '小ロット', 'カスタマイズ', 'industrial', 'manufacturing', 'factory', 'printing', 'BtoB', 'サプライチェーン', '業務改善'],
  'デザイン・UX': ['UX', 'UI', 'デザインリサーチ', 'ユーザー調査', 'ユーザー体験', 'アクセシビリティ', 'HCD', '人間中心設計', 'サービスデザイン', 'デザイン経営', 'デザインシステム', '知財', '特許', '意匠', 'design research', 'accessibility'],
  'ゲーミフィケーション': ['ゲーミフィケーション', 'gamification', '行動変容', '動機づけ', 'ポイント', 'ランキング', 'バッジ', 'エンゲージメント', '研修', '学習効果', '社内浸透', '販促', 'ロイヤルティ', '習慣化', '健康増進', 'セガXD', 'Pokémon Sleep', 'Pokemon Sleep'],
  '国内情勢': ['日本', '政府', '国会', '日銀', '物価', '賃上げ', '選挙', '政策', '経済', '補助金', 'Japan', 'BOJ', '産業政策', '規制', '企業'],
  '国際情勢': ['米国', '中国', 'ロシア', 'ウクライナ', '中東', 'イスラエル', 'NATO', 'EU', '関税', '貿易', '安全保障', 'Ukraine', 'China', 'tariff', 'Middle East', 'サプライチェーン']
};

const BUSINESS_RELEVANCE_KEYWORDS = [
  'BtoB', '法人', '企業', '業務', '事業', '市場', '産業', '経営', '収益', '提案', '営業', '販促', 'マーケティング', '顧客', '導入', '支援', 'DX', 'デジタル変革',
  '業務改善', '生産性', '省人化', '自動化', '研修', '人材育成', '組織', '現場', '製造業', 'サプライチェーン', '知財', '特許', '規制', '政策',
  'enterprise', 'business', 'industry', 'market', 'b2b', 'customer', 'workflow', 'productivity', 'automation', 'marketing', 'training'
];

const LOW_BUSINESS_VALUE_KEYWORDS = [
  '発売', '新発売', '予約開始', 'カラー', 'かわいい', '可愛い', '限定色', 'グッズ', 'フィギュア', 'ぬいぐるみ', 'アニメ', '漫画', 'コラボ商品',
  'PCケース', 'キーボード', 'マウス', 'ヘッドセット', 'ゲーム機', 'ゲーミング', 'ゲーミングpc', 'ゲームパッド', '周辺機器', '玩具', 'おもちゃ',
  'consumer', 'gaming pc', 'keyboard', 'mouse', 'headset', 'console', 'toy'
];

const GAMIFICATION_CONTEXT_KEYWORDS = [
  'ゲーミフィケーション', 'gamification', '行動変容', '動機づけ', '習慣化', '継続率', '参加率', 'エンゲージメント', 'ポイント', 'バッジ', 'ランキング',
  'ミッション', 'クエスト', 'リワード', 'ロイヤルティ', '研修', '学習効果', '社内浸透', '販促', 'マーケティング施策', '健康増進',
  'セガXD', 'Pokémon Sleep', 'Pokemon Sleep', 'ポケモンスリープ'
];

const DESIGN_BUSINESS_CONTEXT_KEYWORDS = [
  'デザインリサーチ', 'ユーザー調査', 'UXリサーチ', 'HCD', '人間中心設計', 'アクセシビリティ', 'ユーザビリティ', 'サービスデザイン', 'デザイン経営',
  'デザインシステム', 'A/Bテスト', '行動経済学', '認知心理', '特許', '知財', '意匠', '標準化', '研究', '調査結果', '論文', 'ガイドライン',
  'design research', 'accessibility', 'usability', 'design system', 'research', 'intellectual property'
];

const SECTION_ORDER = { work: 0, society: 1 };

function todayJST() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

function compactDate(value) {
  return String(value || '').replaceAll('-', '');
}


function shortHash(value, length = 8) {
  return crypto
    .createHash('sha1')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, length);
}

function stableArticleId({ today, section, sourceUrl }) {
  const safeSection = String(section || 'item').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'item';
  return `${compactDate(today)}-${safeSection}-${shortHash(sourceUrl || '')}`;
}

function readJSON(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  return decodeEntities(String(html || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function decodeEntities(text) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };
  return String(text || '')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => named[name] || m);
}

function valueFromTag(xml, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const tag of names) {
    const escaped = tag.replace(':', '\\:');
    const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = xml.match(re);
    if (match) return normalizeWhitespace(stripTags(match[1]));
  }
  return '';
}

function rawValueFromTag(xml, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const tag of names) {
    const escaped = tag.replace(':', '\\:');
    const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = xml.match(re);
    if (match) return decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim());
  }
  return '';
}

function attrFromTag(xml, tagName, attrName) {
  const escaped = tagName.replace(':', '\\:');
  const re = new RegExp(`<${escaped}\\b([^>]*)>`, 'i');
  const match = xml.match(re);
  if (!match) return '';
  const attrs = match[1];
  const attrRe = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
  const attrMatch = attrs.match(attrRe);
  return attrMatch ? decodeEntities(attrMatch[1]) : '';
}

function attrFromAnyTag(xml, tagNames, attrName) {
  for (const tagName of tagNames) {
    const value = attrFromTag(xml, tagName, attrName);
    if (value) return value;
  }
  return '';
}

function blocksForFeed(xml) {
  const blocks = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) blocks.push({ type: 'rss', xml: match[0] });
  while ((match = entryRe.exec(xml)) !== null) blocks.push({ type: 'atom', xml: match[0] });
  return blocks;
}

function absolutizeUrl(url, baseUrl) {
  if (!url) return '';
  try {
    return new URL(url, baseUrl).toString();
  } catch (_error) {
    return '';
  }
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(key => parsed.searchParams.delete(key));
    parsed.hash = '';
    return parsed.toString();
  } catch (_error) {
    return '';
  }
}

function parseFeed(xml, source) {
  const blocks = blocksForFeed(xml);
  const items = [];

  for (const block of blocks) {
    const itemXml = block.xml;
    let link = '';

    if (block.type === 'atom') {
      link = attrFromTag(itemXml, 'link', 'href') || valueFromTag(itemXml, 'link');
    } else {
      link = valueFromTag(itemXml, 'link') || attrFromTag(itemXml, 'link', 'rdf:resource') || attrFromTag(itemXml, 'guid', 'isPermaLink');
    }

    link = cleanUrl(absolutizeUrl(link, source.feed_url));
    if (!link) continue;

    const title = valueFromTag(itemXml, 'title');
    const descriptionRaw = rawValueFromTag(itemXml, ['description', 'content:encoded', 'summary', 'content']);
    const description = normalizeWhitespace(stripTags(descriptionRaw)).slice(0, 1200);
    const publishedRaw = valueFromTag(itemXml, ['pubDate', 'published', 'updated', 'dc:date']);
    const publishedAt = parseDateSafe(publishedRaw);
    const imageUrl = attrFromAnyTag(itemXml, ['media:content', 'media:thumbnail', 'enclosure'], 'url');

    if (!title) continue;

    items.push({
      source_name: source.name,
      source_url: link,
      feed_url: source.feed_url,
      source_section: source.section || '',
      source_category: source.category || '',
      title,
      description,
      published_at: publishedAt ? publishedAt.toISOString() : '',
      published_date: publishedAt ? dateJST(publishedAt) : '',
      source_image_url: cleanUrl(absolutizeUrl(imageUrl, source.feed_url)) || '',
      raw_source: source
    });
  }

  return items;
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dateJST(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function ageDays(item) {
  if (!item.published_at) return 999;
  const published = new Date(item.published_at);
  if (Number.isNaN(published.getTime())) return 999;
  return Math.max(0, (Date.now() - published.getTime()) / 86400000);
}

function isWithinLookback(item, lookbackDays) {
  if (!item.published_at) return true;
  const published = new Date(item.published_at);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  return published >= cutoff;
}

function textForMatch(item) {
  return `${item.title} ${item.description} ${item.page_title || ''} ${item.article_excerpt || ''}`.toLowerCase();
}

function containsAny(text, keywords) {
  const normalized = String(text || '').toLowerCase();
  return keywords.some(keyword => normalized.includes(String(keyword).toLowerCase()));
}

function businessRelevanceScore(item) {
  const text = textForMatch(item);
  let score = 0;
  for (const keyword of BUSINESS_RELEVANCE_KEYWORDS) {
    if (text.includes(String(keyword).toLowerCase())) score += 1.25;
  }
  for (const keyword of LOW_BUSINESS_VALUE_KEYWORDS) {
    if (text.includes(String(keyword).toLowerCase())) score -= 2.25;
  }
  if (containsAny(text, GAMIFICATION_CONTEXT_KEYWORDS)) score += 3;
  if (containsAny(text, DESIGN_BUSINESS_CONTEXT_KEYWORDS)) score += 2.5;
  return score;
}

function businessRuleProblems(candidate, item = {}) {
  const text = textForMatch(candidate);
  const category = String(item.category || candidate.detected_category || '');
  const title = String(candidate.title || item.title || '');
  const problems = [];
  const hasBusinessContext = containsAny(text, BUSINESS_RELEVANCE_KEYWORDS);
  const hasLowValueSignal = containsAny(text, LOW_BUSINESS_VALUE_KEYWORDS);
  const hasGamificationContext = containsAny(text, GAMIFICATION_CONTEXT_KEYWORDS);
  const hasDesignBusinessContext = containsAny(text, DESIGN_BUSINESS_CONTEXT_KEYWORDS);

  if (candidate.detected_section === 'work') {
    if (hasLowValueSignal && !hasBusinessContext && !hasGamificationContext && !hasDesignBusinessContext) {
      problems.push(`BtoC寄りの商品発売・周辺機器・かわいい系ニュースに見えるため、業務インサイトとして弱い: ${title}`);
    }

    if ((category.includes('ゲーミフィケーション') || /ゲーム|gaming|game/.test(text)) && !hasGamificationContext) {
      problems.push(`ゲーミフィケーションではなく、単なるゲーム/機材/商品ニュースに見える。ゲーム要素による課題解決・行動変容・研修/販促/社内施策の文脈が必要: ${title}`);
    }

    if ((category.includes('デザイン') || /デザイン|design|adobe|figma/.test(text)) && !hasDesignBusinessContext && hasLowValueSignal) {
      problems.push(`デザインの業務活用・研究・知財・UXロジックではなく、見た目/新商品紹介寄りに見える: ${title}`);
    }
  }

  return problems;
}
function hasKeywordMatch(item, source) {
  const keywords = source.keywords || [];
  if (!keywords.length) return true;
  const text = textForMatch(item);
  return keywords.some(keyword => text.includes(String(keyword).toLowerCase()));
}

function detectCategory(item) {
  const text = textForMatch(item);
  const scores = Object.fromEntries(Object.keys(CATEGORY_KEYWORDS).map(category => [category, 0]));
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(String(keyword).toLowerCase())) scores[category] += 1;
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : (item.source_category || 'AI・テック');
}

function detectSection(item) {
  if (item.source_section) return item.source_section;
  const category = detectCategory(item);
  return ['国内情勢', '国際情勢'].includes(category) ? 'society' : 'work';
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_error) {
    return '';
  }
}

function isLikelyGenericUrl(url) {
  try {
    const parsed = new URL(url);
    const pathName = parsed.pathname.replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
    if (!pathName || pathName === '') return true;
    const genericPaths = new Set([
      '/news', '/press', '/pressroom', '/releases', '/release', '/topics', '/blog', '/blogs', '/rss', '/feed', '/category', '/categories', '/search', '/articles', '/article', '/events'
    ]);
    if (genericPaths.has(pathName)) return true;
    return false;
  } catch (_error) {
    return true;
  }
}

function isDisallowedDomain(url, disallowedPatterns = []) {
  const hostname = domainOf(url);
  return disallowedPatterns.some(patternText => {
    try {
      return new RegExp(patternText, 'i').test(hostname);
    } catch (_error) {
      return hostname.includes(patternText);
    }
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: {
        'User-Agent': 'daily-briefing-board/9.1 (+https://github.com/Hazuki-seo/Daily-Briefing-Board)',
        'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml,text/xml,application/rss+xml,application/atom+xml,*/*;q=0.8',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, timeoutMs = 20000) {
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function checkUrl(url) {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET' }, 15000);
    if (res.status >= 400) return { ok: false, status: res.status, finalUrl: res.url || url };
    return { ok: true, status: res.status, finalUrl: cleanUrl(res.url || url) };
  } catch (error) {
    return { ok: false, status: 0, finalUrl: url, error: error.message };
  }
}

function extractMeta(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return normalizeWhitespace(decodeEntities(match[1]));
  }
  return '';
}

function extractTitle(html) {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return ogTitle;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeWhitespace(stripTags(match[1])) : '';
}

function extractArticleText(html) {
  const body = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ');

  const paragraphs = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRe.exec(body)) !== null) {
    const text = normalizeWhitespace(stripTags(match[1]));
    if (text.length >= 35) paragraphs.push(text);
    if (paragraphs.join(' ').length > 1800) break;
  }

  if (paragraphs.length) return paragraphs.join(' ').slice(0, 1800);

  return normalizeWhitespace(stripTags(body)).slice(0, 1800);
}

async function enrichCandidate(item) {
  const enriched = { ...item };
  try {
    const res = await fetchWithTimeout(item.source_url, { method: 'GET' }, 16000);
    if (!res.ok) return enriched;
    const finalUrl = cleanUrl(res.url || item.source_url);
    const contentType = res.headers.get('content-type') || '';
    enriched.source_url = finalUrl || item.source_url;
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return enriched;

    const html = await res.text();
    const metaDescription = extractMeta(html, 'description') || extractMeta(html, 'og:description');
    const ogImage = extractMeta(html, 'og:image');
    const pageTitle = extractTitle(html);
    const articleText = extractArticleText(html);

    enriched.page_title = pageTitle || item.title;
    enriched.description = normalizeWhitespace([item.description, metaDescription].filter(Boolean).join(' ')).slice(0, 1400);
    enriched.article_excerpt = articleText;
    if (!enriched.source_image_url && ogImage) {
      enriched.source_image_url = cleanUrl(absolutizeUrl(ogImage, enriched.source_url));
    }
  } catch (error) {
    enriched.enrich_error = error.message;
  }
  return enriched;
}

function scoreCandidate(item, topicWeights = []) {
  const text = textForMatch(item);
  let score = 0;
  const section = detectSection(item);
  const category = detectCategory(item);
  const daysOld = ageDays(item);
  const businessScore = businessRelevanceScore(item);

  // v10.3: freshness matters, but relevance matters more. A slightly older BtoB/useful article
  // should beat a brand-new consumer gadget or cute-product announcement.
  if (section === 'work') score += 6;
  if (section === 'society') score += 4;
  score += Math.max(0, 6 - daysOld * 0.35); // Recency boost fades out instead of dominating.
  if (daysOld > 60) score -= Math.min(4, (daysOld - 60) / 20);

  for (const keyword of CATEGORY_KEYWORDS[category] || []) {
    if (text.includes(String(keyword).toLowerCase())) score += 1;
  }
  score += businessScore * 1.45;
  for (const weight of topicWeights) {
    const keyword = String(weight.keyword || '').toLowerCase();
    const value = Number(weight.weight || 0);
    if (keyword && text.includes(keyword)) score += Math.min(7, value || 1);
  }
  const rawSource = item.raw_source || {};
  if (rawSource.priority) score += Number(rawSource.priority) || 0;
  return score;
}

function summarizeComments(comments) {
  return comments
    .slice(-20)
    .map(comment => ({
      briefing_id: comment.briefing_id,
      name: comment.name,
      comment: comment.comment,
      tags: comment.tags
    }));
}

async function collectCandidates(sourceConfig, topicWeights) {
  const lookbackDays = Number(sourceConfig.lookback_days || 14);
  const relevanceLookbackDays = Number(sourceConfig.relevance_lookback_days || sourceConfig.extended_lookback_days || 60);
  const minExtendedBusinessScore = Number(sourceConfig.min_extended_business_score ?? 2.5);
  const maxPerSource = Number(sourceConfig.max_items_per_source || 16);
  const maxCandidates = Number(sourceConfig.max_candidates_for_ai || 80);
  const disallowedPatterns = sourceConfig.disallowed_domain_patterns || [];

  const all = [];
  const sources = sourceConfig.rss_sources || [];

  for (const source of sources) {
    try {
      console.log(`Collecting RSS: ${source.name} <${source.feed_url}>`);
      const xml = await fetchText(source.feed_url, Number(source.timeout_ms || 20000));
      const sourceLookbackDays = Number(source.lookback_days || lookbackDays);
      const sourceRelevanceLookbackDays = Number(source.relevance_lookback_days || source.extended_lookback_days || relevanceLookbackDays);

      const parsedItems = parseFeed(xml, source)
        .filter(item => !isDisallowedDomain(item.source_url, disallowedPatterns))
        .filter(item => !isLikelyGenericUrl(item.source_url))
        .filter(item => hasKeywordMatch(item, source))
        .map(item => {
          const detected_section = detectSection(item);
          const detected_category = detectCategory(item);
          const business_score = businessRelevanceScore(item);
          const primary_window = isWithinLookback(item, sourceLookbackDays);
          const extended_window = isWithinLookback(item, sourceRelevanceLookbackDays);
          return { ...item, detected_section, detected_category, business_score, primary_window, extended_window };
        })
        .filter(item => {
          if (item.primary_window) return true;
          // v10.3: when recent candidates are weak, allow older but clearly relevant work articles.
          // Society items stay relatively fresh; old society news is usually less useful.
          return item.detected_section === 'work' && item.extended_window && item.business_score >= minExtendedBusinessScore;
        })
        .map(item => ({ ...item, score: scoreCandidate(item, topicWeights) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPerSource);

      const olderRelevant = parsedItems.filter(item => !item.primary_window).length;
      console.log(`  candidates: ${parsedItems.length}${olderRelevant ? ` (${olderRelevant} older relevance-based)` : ''}`);
      all.push(...parsedItems);
    } catch (error) {
      console.warn(`  skipped: ${source.name}: ${error.message}`);
    }
  }

  const dedupedMap = new Map();
  for (const item of all) {
    const key = item.source_url || `${item.source_name}:${item.title}`;
    if (!dedupedMap.has(key)) dedupedMap.set(key, item);
  }

  let deduped = [...dedupedMap.values()];
  deduped = deduped
    .map(item => ({ ...item, detected_section: item.detected_section || detectSection(item), detected_category: item.detected_category || detectCategory(item), score: scoreCandidate(item, topicWeights) }))
    .sort((a, b) => {
      const sectionDiff = (SECTION_ORDER[a.detected_section] ?? 9) - (SECTION_ORDER[b.detected_section] ?? 9);
      if (sectionDiff !== 0) return sectionDiff;
      return b.score - a.score;
    });

  const work = deduped.filter(item => item.detected_section === 'work').slice(0, Math.ceil(maxCandidates * 0.74));
  const society = deduped.filter(item => item.detected_section === 'society').slice(0, Math.ceil(maxCandidates * 0.34));
  const mixed = [...work, ...society]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);

  console.log(`Total usable candidates before URL check: ${mixed.length} (work=${work.length}, society=${society.length})`);

  const checked = [];
  for (const item of mixed) {
    const result = await checkUrl(item.source_url);
    if (!result.ok) {
      console.warn(`  dead URL skipped: ${item.source_url} (${result.status || result.error})`);
      continue;
    }
    const normalizedItem = { ...item, source_url: cleanUrl(result.finalUrl || item.source_url) };
    if (isLikelyGenericUrl(normalizedItem.source_url)) {
      console.warn(`  generic URL skipped: ${normalizedItem.source_url}`);
      continue;
    }
    checked.push(normalizedItem);
  }

  console.log(`Usable candidates after URL check: ${checked.length}`);

  const enriched = [];
  const enrichLimit = Number(sourceConfig.enrich_limit || 48);
  for (const item of checked.slice(0, enrichLimit)) {
    enriched.push(await enrichCandidate(item));
  }
  enriched.push(...checked.slice(enrichLimit));

  return enriched.slice(0, maxCandidates).map((item, index) => ({
    ...item,
    candidate_id: `c${String(index + 1).padStart(3, '0')}`
  }));
}

function outputTextFromResponse(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const output of data.output || []) {
    for (const content of output.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') chunks.push(content.text);
      if (content.type === 'text' && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function makeSchema() {
  const itemProperties = {
    candidate_id: { type: 'string' },
    category: { type: 'string' },
    event_date: { type: 'string' },
    location: { type: 'string' },
    actor: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    image_caption: { type: 'string' },
    what_happened: { type: 'string' },
    background: { type: 'string' },
    watch_point: { type: 'string' },
    work_hint: { type: 'string' },
    importance: { type: 'string' }
  };

  const itemSchema = {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(itemProperties),
    properties: itemProperties
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['work_items', 'society_items'],
    properties: {
      work_items: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: itemSchema
      },
      society_items: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: itemSchema
      }
    }
  };
}

function flattenSelection(selection) {
  const workItems = Array.isArray(selection?.work_items) ? selection.work_items.map(item => ({ ...item, section: 'work' })) : [];
  const societyItems = Array.isArray(selection?.society_items) ? selection.society_items.map(item => ({ ...item, section: 'society' })) : [];
  return [...workItems, ...societyItems];
}

function makePrompt({ today, candidates, topicWeights, comments, previousError = '' }) {
  const toPayload = candidate => ({
    candidate_id: candidate.candidate_id,
    detected_category: candidate.detected_category,
    source_name: candidate.source_name,
    published_date: candidate.published_date,
    title: candidate.title,
    page_title: candidate.page_title || '',
    description: normalizeWhitespace(candidate.description || '').slice(0, 700),
    article_excerpt: normalizeWhitespace(candidate.article_excerpt || '').slice(0, 900),
    domain: domainOf(candidate.source_url)
  });

  const workCandidates = candidates.filter(candidate => candidate.detected_section === 'work').map(toPayload);
  const societyCandidates = candidates.filter(candidate => candidate.detected_section === 'society').map(toPayload);

  return `あなたは日本語のニュース編集者です。下記の候補記事だけを使い、ニュースボード用のデイリーブリーフィングを作成してください。\n\n` +
    `日付: ${today}（日本時間）\n\n` +
    (previousError ? `前回の出力は検証に失敗しました。今回は必ず修正してください。検証エラー:\n${previousError}\n\n` : '') +
    `最重要ルール:\n` +
    `- source_urlは出力しない。URLはシステム側でcandidate_idから元記事URLをコピーする。\n` +
    `- 候補一覧にない記事、候補一覧にないURL、推測した事実は使わない。\n` +
    `- candidate_idは候補一覧に存在するものだけを使う。7本すべて別のcandidate_idにする。\n` +
    `- work_items は「業務インサイト」専用。必ず WORK候補記事一覧から5本だけ選ぶ。\n` +
    `- society_items は「時事チェック」専用。必ず SOCIETY候補記事一覧から2本だけ選ぶ。\n` +
    `- work_items にSOCIETY候補のcandidate_idを入れない。society_items にWORK候補のcandidate_idを入れない。\n` +
    `- 業務インサイトは「BtoBで情報を活用し、企画・提案・調査・資料作成・業務改善・顧客支援に使えるニュース」を最優先する。NewsPicksが扱うような、企業活動・産業構造・市場・技術実装・制度・知財・業務活用に関わる内容を選ぶ。\n` +
    `- BtoC向けの新商品発売、ガジェット/PC周辺機器、かわいいデザイン、単なるプロダクト紹介は原則選ばない。例外は、BtoB提案・製造/販促/UX/知財/研究・企業施策に転用できる文脈が明確な場合だけ。\n` +
    `- ゲーミフィケーションは「ゲーム」ではない。ゲーム要素（ポイント、ミッション、バッジ、ランキング、リワード、ストーリー、継続設計など）を使って課題解決・行動変容・研修・販促・社内浸透・健康/教育/業務改善につなげる事例だけを選ぶ。ゲーム機材、ゲーミングPC、周辺機器、通常のゲーム新作は選ばない。Pokémon SleepやセガXDのように、行動変容・企業施策・マーケティング活用として語れるものは可。\n` +
    `- デザイン・UXは「かわいいものが発売」「新色/見た目の紹介」は不要。デザインリサーチ、UX調査、アクセシビリティ、デザインシステム、知財/意匠、行動心理、研究結果、業務で使える設計ロジックがあるものだけを選ぶ。\n` +
    `- 直近コメントやtopic_weightsで「もっと見たい」「追いたい」「使える」と示されたテーマは、候補に該当記事がある限り優先する。ただし上記のBtoB/業務活用ルールを満たさない候補は選ばない。\n` +
    `- 特にゲーミフィケーション、製造業DX、AI活用、BtoBマーケティング、業務改善などの要望コメントがある場合、WORK候補内に近い記事があればwork_itemsに最低1本は入れる。ただし候補に存在しない記事を作らない。\n` +
    `- 時事チェックは、国内情勢・国際情勢から社会の前提知識として押さえるべき内容を選ぶ。\n` +
    `- いつ・どこで・誰が・何をしたかが分かるように書く。候補にない場合は「発表資料上は明記なし」「オンライン公開」など、分からないことを分からないまま書く。\n` +
    `- what_happened/background/watch_point/work_hint は、それぞれ前提を知らない人にも分かる2〜3文程度にする。\n` +
    `- titleは日本語で具体的に。summaryは1〜2文。importanceは1〜5の数字文字列。\n` +
    `- categoryは「AI・テック」「印刷・製造業」「デザイン・UX」「ゲーミフィケーション」「国内情勢」「国際情勢」のいずれかを基本にする。\n\n` +
    `関心テーマ(topic_weights):\n${JSON.stringify(topicWeights.slice(0, 20), null, 2)}\n\n` +
    `直近コメント:\n${JSON.stringify(comments, null, 2)}\n\n` +
    `WORK候補記事一覧（work_itemsはこの中から5本だけ）:\n${JSON.stringify(workCandidates, null, 2)}\n\n` +
    `SOCIETY候補記事一覧（society_itemsはこの中から2本だけ）:\n${JSON.stringify(societyCandidates, null, 2)}\n`;
}

async function callOpenAI({ today, candidates, topicWeights, comments, previousError = '' }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing. Add it as a GitHub Actions repository secret.');

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const body = {
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'あなたはBtoB企業向けの日本語ニュース編集者です。必ず指定されたJSONスキーマに従ってください。候補記事のcandidate_idだけを根拠にし、URLや事実を作らないでください。業務活用・企画提案・産業動向・NewsPicks的なビジネス視点を最優先し、単なるBtoC商品紹介やゲーム機材ニュースを避けてください。'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: makePrompt({ today, candidates, topicWeights, comments, previousError })
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'daily_briefing_selection_v10_3',
        strict: true,
        schema: makeSchema()
      }
    },
    max_output_tokens: 11000
  };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const text = outputTextFromResponse(data);
  if (!text) throw new Error('OpenAI API returned empty output text.');

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(text);
    throw new Error(`Failed to parse OpenAI JSON output: ${error.message}`);
  }
}

function validateSelection(selection, candidates) {
  if (!selection || !Array.isArray(selection.work_items) || !Array.isArray(selection.society_items)) {
    throw new Error('OpenAI output must contain work_items array and society_items array.');
  }
  if (selection.work_items.length !== 5) throw new Error(`Expected 5 work_items, got ${selection.work_items.length}.`);
  if (selection.society_items.length !== 2) throw new Error(`Expected 2 society_items, got ${selection.society_items.length}.`);

  const candidateMap = new Map(candidates.map(candidate => [candidate.candidate_id, candidate]));
  const used = new Set();
  const errors = [];

  const groups = [
    ['work_items', selection.work_items, 'work'],
    ['society_items', selection.society_items, 'society']
  ];

  for (const [groupName, items, expectedSection] of groups) {
    for (const [index, item] of items.entries()) {
      const label = `${groupName}[${index + 1}]`;
      const candidate = candidateMap.get(item.candidate_id);
      if (!candidate) {
        errors.push(`${label}: unknown candidate_id ${item.candidate_id}`);
        continue;
      }
      if (used.has(item.candidate_id)) errors.push(`${label}: duplicate candidate_id ${item.candidate_id}`);
      used.add(item.candidate_id);
      if (candidate.detected_section !== expectedSection) {
        errors.push(`${label}: candidate_id ${item.candidate_id} belongs to ${candidate.detected_section}, not ${expectedSection}`);
      }
      if (expectedSection === 'work') {
        const problems = businessRuleProblems(candidate, item);
        for (const problem of problems) errors.push(`${label}: ${problem}`);
      }
      if (!String(item.title || '').trim()) errors.push(`${label}: missing title`);
      if (!String(item.what_happened || '').trim()) errors.push(`${label}: missing what_happened`);
      if (!String(item.background || '').trim()) errors.push(`${label}: missing background`);
      if (!String(item.watch_point || '').trim()) errors.push(`${label}: missing watch_point`);
      if (!String(item.work_hint || '').trim()) errors.push(`${label}: missing work_hint`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
}

function selectedRows({ selection, candidates, today }) {
  const candidateMap = new Map(candidates.map(candidate => [candidate.candidate_id, candidate]));
  const items = flattenSelection(selection);
  return items.map((item, index) => {
    const candidate = candidateMap.get(item.candidate_id);
    return {
      date: today,
      id: stableArticleId({ today, section: item.section, sourceUrl: candidate.source_url }),
      section: item.section,
      category: normalizeWhitespace(item.category || candidate.detected_category),
      source_name: normalizeWhitespace(candidate.source_name),
      published_date: candidate.published_date || today,
      event_date: normalizeWhitespace(item.event_date || candidate.published_date || today),
      location: normalizeWhitespace(item.location || ''),
      actor: normalizeWhitespace(item.actor || ''),
      title: normalizeWhitespace(item.title),
      summary: normalizeWhitespace(item.summary),
      source_url: candidate.source_url,
      source_image_url: candidate.source_image_url || '',
      image_caption: normalizeWhitespace(item.image_caption || ''),
      what_happened: normalizeWhitespace(item.what_happened),
      background: normalizeWhitespace(item.background),
      watch_point: normalizeWhitespace(item.watch_point),
      work_hint: normalizeWhitespace(item.work_hint),
      importance: String(item.importance || '3').replace(/[^1-5]/g, '') || '3'
    };
  });
}

function writeBriefings({ newRows, today, replaceToday }) {
  const existingRows = readCSV(BRIEFINGS_PATH);
  const keptRows = replaceToday ? existingRows.filter(row => row.date !== today) : existingRows;
  const rows = [...keptRows, ...newRows];
  fs.writeFileSync(BRIEFINGS_PATH, toCSV(rows, BRIEFING_HEADERS), 'utf8');
}

async function main() {
  const today = todayJST();
  const sourceConfig = readJSON(SOURCES_PATH, {});
  const topicWeights = readCSV(TOPIC_WEIGHTS_PATH);
  const comments = summarizeComments(readCSV(COMMENTS_PATH));
  const replaceToday = String(process.env.REPLACE_TODAY || 'true') === 'true';
  const dryRun = String(process.env.DRY_RUN || 'false') === 'true';

  console.log('Collecting existing source URLs from RSS/Atom feeds first.');
  const candidates = await collectCandidates(sourceConfig, topicWeights);

  const workCandidates = candidates.filter(candidate => candidate.detected_section === 'work').length;
  const societyCandidates = candidates.filter(candidate => candidate.detected_section === 'society').length;
  console.log(`Candidate pool: ${candidates.length} total / work=${workCandidates} / society=${societyCandidates}`);

  if (workCandidates < 5 || societyCandidates < 2) {
    throw new Error(`Not enough candidates. Need at least work=5 and society=2, got work=${workCandidates}, society=${societyCandidates}. Add RSS sources or increase lookback_days in data/sources.json.`);
  }

  let selection = null;
  let previousError = '';
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) console.log(`Retrying OpenAI selection. Attempt ${attempt}/${maxAttempts}.`);
    selection = await callOpenAI({ today, candidates, topicWeights, comments, previousError });
    try {
      validateSelection(selection, candidates);
      previousError = '';
      break;
    } catch (error) {
      previousError = error.message;
      if (attempt === maxAttempts) throw error;
      console.warn(`Selection validation failed:
${previousError}`);
    }
  }

  const rows = selectedRows({ selection, candidates, today });

  console.log('Generated rows:');
  for (const row of rows) {
    console.log(`- [${row.section}] ${row.title} — ${row.source_name} ${row.source_url}`);
  }

  if (dryRun) {
    console.log('DRY_RUN=true, not writing data/briefings.csv.');
    return;
  }

  writeBriefings({ newRows: rows, today, replaceToday });
  console.log(`Updated ${BRIEFINGS_PATH}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
