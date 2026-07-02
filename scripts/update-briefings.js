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
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function makePrompt(today, sourceConfig, topicWeights, comments) {
  const themes = (sourceConfig.queries || []).map(query => ({
    section: query.section,
    category: query.category,
    label: query.label,
    search_hint: query.query
  }));

  return `あなたは日本語のニュース編集者です。Web検索を使って、ニュースボード用のデイリーブリーフィングを作成してください。\n\n` +
    `日付: ${today}（日本時間）\n\n` +
    `構成:\n` +
    `- 業務インサイト5本: 印刷・製造業、デザイン・UX、AI・テック、ゲーミフィケーションを中心に、企画・提案・調査・資料作成に使えるニュースを選ぶ。\n` +
    `- 時事チェック2本: 国内情勢・国際情勢から、社会の前提知識として押さえるべきニュースを選ぶ。\n\n` +
    `検索方針:\n` +
    `- 直近7日以内を基本に、公式発表・一次情報・信頼できる報道を優先する。\n` +
    `- 公式発表、企業ニュースリリース、官公庁、展示会公式、信頼できる報道を優先する。\n` +
    `- source_urlには、必ずWeb検索で確認できた実在URLを入れる。存在しないURLや推測URLを作らない。\n` +
    `- source_urlは、そのニュースの個別記事・個別プレスリリース・個別発表資料・個別報道ページにする。企業トップページ、サービス紹介ページ、ニュース一覧ページ、カテゴリページ、採用ページ、汎用トップページは禁止。個別ページが見つからない場合は別のニュースを選ぶ。\n` +
    `- source_nameは、source_urlのページ名や媒体名が分かる名前にする。企業名だけではなく、可能なら「企業名 ニュースリリース」「媒体名 記事」などにする。\n` +
    `- source_image_urlは、記事や公式発表に紐づく画像URLが確認できる場合だけ入れる。分からない場合は空文字にする。\n` +
    `- 1つの媒体・企業に偏りすぎないようにする。\n\n` +
    `必須ルール:\n` +
    `- itemsは必ず7本。section=workを5本、section=societyを2本にする。\n` +
    `- いつ・どこで・誰が・何をしたかが分かるように書く。記事に明記がない場合は「発表資料上は明記なし」「オンライン公開」など、分からないことを分からないまま書く。\n` +
    `- source_urlがトップページや一覧ページになりそうな場合、その項目は採用しない。必ず個別URLを確認できたニュースだけを採用する。\n` +
    `- 短文メモにしない。what_happened/background/watch_point/work_hint は、それぞれ前提を知らない人にも分かる2〜3文程度にする。\n` +
    `- summaryは1〜2文で要点を説明する。titleは日本語で、煽りすぎず具体的にする。\n` +
    `- importanceは1〜5の数字文字列にする。\n` +
    `- 直近コメントやtopic_weightsに関連するテーマは優先してよいが、低品質な記事は選ばない。\n\n` +
    `探索テーマ:\n${JSON.stringify(themes, null, 2)}\n\n` +
    `優先ドメイン候補:\n${JSON.stringify(sourceConfig.preferred_domains || [], null, 2)}\n\n` +
    `関心テーマ(topic_weights):\n${JSON.stringify(topicWeights.slice(0, 20), null, 2)}\n\n` +
    `直近コメント:\n${JSON.stringify(comments, null, 2)}\n`;
}

async function callOpenAI({ today, sourceConfig, topicWeights, comments }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it as a GitHub Actions repository secret.');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const body = {
    model,
    tools: [
      { type: 'web_search' }
    ],
    tool_choice: 'required',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'あなたは日本語のニュース編集者です。必ず指定されたJSONスキーマに従ってください。Web検索で確認できた事実だけを使い、根拠のない事実・URL・画像URLを作らないでください。'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: makePrompt(today, sourceConfig, topicWeights, comments)
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
    max_output_tokens: 12000
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


function isLikelyGenericSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const path = url.pathname.replace(/\/+$/, '');
    const lowerPath = path.toLowerCase();

    if (!path || path === '') return true;

    const genericPaths = new Set([
      '',
      '/jp',
      '/ja',
      '/japan',
      '/news',
      '/press',
      '/pressrelease',
      '/press-releases',
      '/newsroom',
      '/topics',
      '/information',
      '/ir',
      '/company',
      '/about',
      '/products',
      '/services'
    ]);

    if (genericPaths.has(lowerPath)) return true;

    const segments = lowerPath.split('/').filter(Boolean);
    if (segments.length <= 1 && !/[0-9]{4}|article|release|detail|entry|post|news\//i.test(lowerPath)) {
      return true;
    }

    return false;
  } catch (_error) {
    return true;
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
    if (isLikelyGenericSourceUrl(item.source_url)) {
      throw new Error(`Item ${index + 1}: source_url looks like a top/list page, not a specific article/release: ${item.source_url}`);
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

  console.log('Collecting and generating with OpenAI web_search.');
  const generated = await callOpenAI({
    today,
    sourceConfig,
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
