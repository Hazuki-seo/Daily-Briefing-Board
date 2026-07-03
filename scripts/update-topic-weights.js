const fs = require('fs');
const path = require('path');
const { parseCSV, toCSV } = require('./csv-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const COMMENTS_PATH = path.join(DATA_DIR, 'comments.csv');
const WEIGHTS_PATH = path.join(DATA_DIR, 'topic_weights.csv');

const headers = ['keyword', 'category', 'weight', 'reason', 'updated_at'];
const today = new Date().toISOString().slice(0, 10);

const TOPIC_RULES = [
  { keyword: '印刷DX', category: '印刷・製造業', patterns: ['印刷DX', 'デジタル印刷', '印刷', 'プリント', 'オンデマンド印刷'] },
  { keyword: 'カスタマイズ印刷', category: '印刷・製造業', patterns: ['カスタマイズ印刷', 'パーソナライズ', '小ロット', '可変印刷', 'ノベルティ'] },
  { keyword: 'スマートファクトリー', category: '製造業', patterns: ['スマートファクトリー', '工場DX', '製造業DX', '製造DX', 'IoT'] },
  { keyword: '設備保全', category: '製造業', patterns: ['設備保全', '予知保全', '保全', 'メンテナンス', '設備'] },
  { keyword: '安全教育', category: '製造業', patterns: ['安全教育', '安全衛生', 'ヒヤリハット', '労災', '作業安全'] },
  { keyword: '多能工化', category: '製造業', patterns: ['多能工', 'リスキリング', '技能継承', '人手不足', '教育'] },
  { keyword: 'フィジカルAI', category: 'AI・テック', patterns: ['フィジカルAI', 'Physical AI', 'ロボットAI', '現場AI', 'AIロボット'] },
  { keyword: 'AIエージェント', category: 'AI・テック', patterns: ['AIエージェント', 'エージェント', 'agent', '業務自動化'] },
  { keyword: '生成AI', category: 'AI・テック', patterns: ['生成AI', 'LLM', 'ChatGPT', 'OpenAI', 'Gemini', 'Claude'] },
  { keyword: 'AI×UX', category: 'デザイン・UX', patterns: ['AI×UX', 'UX', 'UI', 'Figma', 'ユーザー体験', 'デザイン'] },
  { keyword: '行動変容', category: 'ゲーミフィケーション', patterns: ['行動変容', '習慣化', 'ナッジ', 'モチベーション'] },
  { keyword: 'ゲーミフィケーション', category: 'ゲーミフィケーション', patterns: ['ゲーミフィケーション', 'ゲーム化', 'バッジ', '称号', 'ランキング', 'ポイント'] },
  { keyword: '資料作成', category: '企画・提案', patterns: ['資料作成', '提案資料', '企画書', '調査', '提案'] },
  { keyword: '国内情勢', category: '時事チェック', patterns: ['国内情勢', '政治', '政策', '経済', '物価', '日銀'] },
  { keyword: '国際情勢', category: '時事チェック', patterns: ['国際情勢', '米国', '中国', '欧州', '安全保障', '地政学'] }
];

const BOOST_WORDS = ['もっと', '多め', '追いたい', '深掘り', '詳しく', '使える', '良い', 'よかった', '参考', '提案に使える', '重要', '気になる'];
const DOWN_WORDS = ['少なめ', '減らして', '不要', 'いらない', '関係ない', '優先度低い'];

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function splitTags(tags) {
  return String(tags || '')
    .split(/[;；,、\s]+/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

function normalizeKeyword(value) {
  return String(value || '')
    .replace(/^#+/, '')
    .trim()
    .slice(0, 40);
}

function guessCategory(keyword) {
  const rule = TOPIC_RULES.find(rule => rule.keyword === keyword || rule.patterns.some(pattern => keyword.includes(pattern)));
  if (rule) return rule.category;
  if (/印刷|プリント|カスタマイズ|ノベルティ|小ロット/.test(keyword)) return '印刷・製造業';
  if (/製造|工場|設備|保全|安全|多能工|現場|ロボット|スマート/.test(keyword)) return '製造業';
  if (/UX|UI|デザイン|体験|Figma|ユーザー/.test(keyword)) return 'デザイン・UX';
  if (/AI|生成AI|LLM|エージェント|テック/.test(keyword)) return 'AI・テック';
  if (/ゲーム|ゲーミフィケーション|行動変容|習慣|称号|バッジ/.test(keyword)) return 'ゲーミフィケーション';
  if (/国内|国際|政治|経済|政策|情勢/.test(keyword)) return '時事チェック';
  return 'コメント由来';
}

function commentDirection(text) {
  const lower = String(text || '').toLowerCase();
  const boost = BOOST_WORDS.some(word => lower.includes(word.toLowerCase()));
  const down = DOWN_WORDS.some(word => lower.includes(word.toLowerCase()));
  if (down && !boost) return -1;
  if (boost && !down) return 2;
  return 1;
}

function addSignal(signals, keyword, category, amount, source) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return;
  const current = signals.get(normalized) || { keyword: normalized, category: category || guessCategory(normalized), score: 0, sources: [] };
  current.score += amount;
  current.sources.push(source);
  if (!current.category || current.category === 'コメント由来') current.category = category || guessCategory(normalized);
  signals.set(normalized, current);
}

function extractSignals(comments) {
  const signals = new Map();

  for (const comment of comments) {
    const text = `${comment.comment || ''} ${comment.tags || ''}`;
    const direction = commentDirection(text);

    for (const tag of splitTags(comment.tags)) {
      addSignal(signals, tag, guessCategory(tag), Math.max(1, direction + 1), 'タグ');
    }

    for (const rule of TOPIC_RULES) {
      if (rule.patterns.some(pattern => text.toLowerCase().includes(pattern.toLowerCase()))) {
        addSignal(signals, rule.keyword, rule.category, direction, '本文');
      }
    }
  }

  return signals;
}

function main() {
  const comments = readCSV(COMMENTS_PATH).filter(comment => String(comment.status || 'approved') === 'approved');
  const weights = readCSV(WEIGHTS_PATH);
  const map = new Map(weights.map(row => [row.keyword, { ...row }]));

  const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentComments = comments.filter(comment => {
    const time = Date.parse(comment.created_at);
    return Number.isNaN(time) || time >= recentThreshold;
  });

  const signals = extractSignals(recentComments);
  let changed = false;

  for (const signal of signals.values()) {
    const current = map.get(signal.keyword) || {
      keyword: signal.keyword,
      category: signal.category,
      weight: '3',
      reason: 'コメントから自動抽出',
      updated_at: today
    };

    const currentWeight = Number(current.weight || 0);
    const nextWeight = Math.max(1, Math.min(10, currentWeight + signal.score));
    const uniqueSources = [...new Set(signal.sources)].join('・');
    const next = {
      keyword: signal.keyword,
      category: current.category || signal.category,
      weight: String(nextWeight),
      reason: `直近コメント由来：${uniqueSources}で反応あり（+${signal.score}）`,
      updated_at: today
    };

    if (JSON.stringify(current) !== JSON.stringify(next)) {
      map.set(signal.keyword, next);
      changed = true;
    }
  }

  // コメント反応がないテーマは急に消さず、30日以内に更新されていないものだけ少し弱める。
  for (const [keyword, row] of map.entries()) {
    if (signals.has(keyword)) continue;
    const updated = Date.parse(row.updated_at || '');
    const stale = Number.isNaN(updated) || updated < recentThreshold;
    if (stale && Number(row.weight || 0) > 1) {
      const next = {
        ...row,
        weight: String(Math.max(1, Number(row.weight || 0) - 1)),
        reason: row.reason || 'コメント反応が少ないため微調整',
        updated_at: today
      };
      map.set(keyword, next);
      changed = true;
    }
  }

  if (!changed) {
    console.log('No topic weight changes.');
    return;
  }

  const nextRows = [...map.values()]
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0) || String(a.keyword).localeCompare(String(b.keyword), 'ja'));

  fs.writeFileSync(WEIGHTS_PATH, toCSV(nextRows, headers), 'utf8');
  console.log(`Updated topic weights: ${nextRows.length} rows.`);
}

main();
