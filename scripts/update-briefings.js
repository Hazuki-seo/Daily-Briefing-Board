const fs = require('fs');
const path = require('path');
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

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function asISODate(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  // GDELT often returns YYYYMMDDHHMMSS.
  const gdelt = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (gdelt) return `${gdelt[1]}-${gdelt[2]}-${gdelt[3]}`;

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return text.slice(0, 10);
}

function daysAgoDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function withinLookback(value, lookbackDays) {
  const text = String(value || '').trim();
  if (!text) return true;
  const parsed = new Date(asISODate(text));
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed >= daysAgoDate(lookbackDays + 1);
}

function candidateKey(candidate) {
  return normalizeWhitespace(candidate.url || candidate.title).toLowerCase();
}

function scoreCandidate(candidate, preferredDomains, topicWeights) {
  let score = 0;
  const domain = candidate.domain || hostnameFromUrl(candidate.url);
  if (preferredDomains.some(preferred => domain.endsWith(preferred))) score += 3;

  const haystack = `${candidate.title} ${candidate.source} ${candidate.category} ${candidate.label}`.toLowerCase();
  for (const weight of topicWeights) {
    const keyword = String(weight.keyword || '').toLowerCase();
    if (keyword && haystack.includes(keyword)) {
      score += Number(weight.weight || 0) / 2;
    }
  }

  if (candidate.image) score += 0.5;
  if (candidate.section === 'work') score += 0.2;
  return score;
}

async function fetchGdelt(queryConfig, sourceConfig) {
  const max = Number(sourceConfig.max_candidates_per_query || 12);
  const lookbackDays = Number(sourceConfig.lookback_days || 7);
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', queryConfig.query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', String(max));
  url.searchParams.set('sort', 'hybridrel');
  url.searchParams.set('timespan', `${lookbackDays}d`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'daily-news-briefing-board/1.0'
    }
  });

  if (!res.ok) {
    console.warn(`GDELT request failed: ${res.status} ${res.statusText} for ${queryConfig.label}`);
    return [];
  }

  const data = await res.json();
  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles
    .filter(article => article && article.url && article.title)
    .filter(article => withinLookback(article.seendate || article.datetime, lookbackDays))
    .map(article => {
      const domain = article.domain || hostnameFromUrl(article.url);
      return {
        section: queryConfig.section,
        category: queryConfig.category,
        label: queryConfig.label,
        title: normalizeWhitespace(article.title),
        url: article.url,
        source: article.source || domain,
        domain,
        published_date: asISODate(article.seendate || article.datetime || article.publishedDate),
        language: article.language || '',
        source_country: article.sourcecountry || article.country || '',
        image: article.socialimage || article.image || ''
      };
    });
}

async function collectCandidates(sourceConfig, topicWeights) {
  const all = [];
  for (const query of sourceConfig.queries || []) {
    console.log(`Collecting: ${query.label}`);
    const items = await fetchGdelt(query, sourceConfig);
    all.push(...items);
  }

  const byKey = new Map();
  for (const item of all) {
    const key = candidateKey(item);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, item);
  }

  const preferredDomains = sourceConfig.preferred_domains || [];
  return [...byKey.values()]
    .map(item => ({
      ...item,
      score: scoreCandidate(item, preferredDomains, topicWeights)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 90);
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
    section: { type: 'string', enum: ['work', 'society'] },
    category: { type: 'string' },
    source_name: { type: 'string' },
    published_date: { type: 'string' },
    event_date: { type: 'string' },
    location: { type: 'string' },
    actor: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    source_url: { type: 'string' },
    source_image_url: { type: 'string' },
    image_caption: { type: 'string' },
    what_happened: { type: 'string' },
    background: { type: 'string' },
    watch_point: { type: 'string' },
    work_hint: { type: 'string' },
    importance: { type: 'string' }
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 7,
        maxItems: 7,
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(itemProperties),
          properties: itemProperties
        }
      }
    }
  };
}

function makePrompt(today, candidates, topicWeights, comments) {
  return `あなたは日本語のニュース編集者です。以下の候補記事だけを材料に、ニュースボード用のデイリーブリーフィングを作成してください。\n\n` +
    `日付: ${today}\n\n` +
    `目的:\n` +
    `- 「業務インサイト」5本: 印刷・製造業、デザイン・UX、AI・テック、ゲーミフィケーションを中心に、企画・提案・調査・資料作成に使えるニュースを選ぶ。\n` +
    `- 「時事チェック」2本: 国内情勢・国際情勢から、社会の前提知識として押さえるべきニュースを選ぶ。\n\n` +
    `必須ルール:\n` +
    `- itemsは必ず7本。section=workを5本、section=societyを2本にする。\n` +
    `- いつ・どこで・誰が・何をしたかが分かるように書く。記事に明記がない場合は「発表資料上は明記なし」「オンライン公開」など、分からないことを分からないまま書く。\n` +
    `- 短文メモにしない。what_happened/background/watch_point/work_hint は、それぞれ前提を知らない人にも分かる2〜3文程度にする。\n` +
    `- source_urlは候補記事のurlをそのまま使う。候補にないURLを作らない。\n` +
    `- source_image_urlは候補記事にimageがあり、記事に紐づく画像として自然な場合だけ入れる。なければ空文字。\n` +
    `- summaryは1〜2文で要点を説明する。titleは日本語で、煽りすぎず具体的にする。\n` +
    `- 重要度は1〜5。\n` +
    `- 直近コメントやtopic_weightsに関連するテーマは優先してよいが、低品質な記事は選ばない。\n\n` +
    `関心テーマ(topic_weights):\n${JSON.stringify(topicWeights.slice(0, 20), null, 2)}\n\n` +
    `直近コメント:\n${JSON.stringify(comments, null, 2)}\n\n` +
    `候補記事:\n${JSON.stringify(candidates, null, 2)}\n`;
}

async function callOpenAI({ today, candidates, topicWeights, comments }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it as a GitHub Actions repository secret.');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const body = {
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'あなたは日本語のニュース編集者です。必ず指定されたJSONスキーマに従い、根拠のない事実を作らず、候補記事だけを材料にしてください。'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: makePrompt(today, candidates, topicWeights, comments)
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'daily_briefing_items',
        strict: true,
        schema: makeSchema()
      }
    },
    max_output_tokens: 9000
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

function validateGenerated(generated) {
  if (!generated || !Array.isArray(generated.items)) {
    throw new Error('Generated output does not contain items array.');
  }
  if (generated.items.length !== 7) {
    throw new Error(`Expected 7 items, got ${generated.items.length}.`);
  }

  const workCount = generated.items.filter(item => item.section === 'work').length;
  const societyCount = generated.items.filter(item => item.section === 'society').length;
  if (workCount !== 5 || societyCount !== 2) {
    throw new Error(`Expected 5 work and 2 society items, got ${workCount} work and ${societyCount} society.`);
  }

  for (const [index, item] of generated.items.entries()) {
    for (const header of BRIEFING_HEADERS.filter(header => !['date', 'id'].includes(header))) {
      if (item[header] === undefined || item[header] === null) {
        throw new Error(`Item ${index + 1}: missing ${header}.`);
      }
    }
    if (!/^https?:\/\//.test(String(item.source_url || ''))) {
      throw new Error(`Item ${index + 1}: source_url must be http(s).`);
    }
  }
}

function rowFromGeneratedItem(today, item, index) {
  const id = `${compactDate(today)}-${String(index + 1).padStart(2, '0')}`;
  const row = { date: today, id };

  for (const header of BRIEFING_HEADERS) {
    if (header === 'date' || header === 'id') continue;
    row[header] = normalizeWhitespace(item[header]);
  }

  row.importance = String(row.importance || '4').replace(/[^0-9]/g, '') || '4';
  return row;
}

async function main() {
  const today = todayJST();
  const replaceToday = String(process.env.REPLACE_TODAY || 'true').toLowerCase() !== 'false';
  const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

  const sourceConfig = readJSON(SOURCES_PATH);
  const existingBriefings = readCSV(BRIEFINGS_PATH);
  const comments = readCSV(COMMENTS_PATH);
  const topicWeights = readCSV(TOPIC_WEIGHTS_PATH);

  if (!replaceToday && existingBriefings.some(row => row.date === today)) {
    console.log(`Briefings for ${today} already exist. Set REPLACE_TODAY=true to replace.`);
    return;
  }

  const candidates = await collectCandidates(sourceConfig, topicWeights);
  console.log(`Collected ${candidates.length} candidate articles.`);
  if (candidates.length < 14) {
    console.warn('Candidate count is low. The model will still try to produce 7 items.');
  }

  const generated = await callOpenAI({
    today,
    candidates,
    topicWeights,
    comments: summarizeComments(comments)
  });

  validateGenerated(generated);
  const newRows = generated.items.map((item, index) => rowFromGeneratedItem(today, item, index));

  const preservedRows = replaceToday
    ? existingBriefings.filter(row => row.date !== today)
    : existingBriefings;

  const updatedRows = [...preservedRows, ...newRows];
  const csv = toCSV(updatedRows, BRIEFING_HEADERS);

  if (dryRun) {
    console.log('DRY_RUN=true; generated rows:');
    console.log(toCSV(newRows, BRIEFING_HEADERS));
    return;
  }

  fs.writeFileSync(BRIEFINGS_PATH, csv, 'utf8');
  console.log(`Updated ${BRIEFINGS_PATH} with ${newRows.length} rows for ${today}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
