const fs = require('fs');
const path = require('path');
const { parseCSV, toCSV } = require('./csv-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const COMMENTS_PATH = path.join(DATA_DIR, 'comments.csv');
const WEIGHTS_PATH = path.join(DATA_DIR, 'topic_weights.csv');

const headers = ['keyword', 'category', 'weight', 'reason', 'updated_at'];
const today = new Date().toISOString().slice(0, 10);

function splitTags(tags) {
  return String(tags || '')
    .split(/[;；,、]/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

function guessCategory(keyword) {
  if (/印刷|プリント|カスタマイズ|ノベルティ|DTF|UV/.test(keyword)) return '印刷・製造業';
  if (/製造|工場|設備|保全|安全|多能工|現場|ロボット|フィジカル/.test(keyword)) return '製造業';
  if (/UX|UI|デザイン|体験|Figma|ユーザー/.test(keyword)) return 'デザイン・UX';
  if (/AI|生成AI|LLM|エージェント|テック/.test(keyword)) return 'AI・テック';
  if (/ゲーム|ゲーミフィケーション|行動変容|習慣|称号|バッジ/.test(keyword)) return 'ゲーミフィケーション';
  return '未分類';
}

function readCSV(filePath) {
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const comments = readCSV(COMMENTS_PATH).filter(comment => comment.status === 'approved');
  const weights = readCSV(WEIGHTS_PATH);
  const map = new Map(weights.map(row => [row.keyword, { ...row }]));
  let changed = false;

  const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentComments = comments.filter(comment => {
    const time = Date.parse(comment.created_at);
    return Number.isNaN(time) || time >= recentThreshold;
  });

  const counts = new Map();

  for (const comment of recentComments) {
    const tags = splitTags(comment.tags);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }

    const text = `${comment.comment || ''} ${comment.tags || ''}`;
    const keywords = ['フィジカルAI', '設備保全', '安全教育', 'カスタマイズ印刷', 'AI×UX', '行動変容', 'ゲーミフィケーション', '製造業DX', '小ロット', '内製化'];
    for (const keyword of keywords) {
      if (text.includes(keyword)) counts.set(keyword, (counts.get(keyword) || 0) + 1);
    }
  }

  for (const [keyword, count] of counts.entries()) {
    const current = map.get(keyword) || {
      keyword,
      category: guessCategory(keyword),
      weight: '3',
      reason: 'コメントから自動抽出',
      updated_at: today
    };

    const nextWeight = Math.min(10, Math.max(Number(current.weight || 0), 3 + count));
    const next = {
      ...current,
      category: current.category || guessCategory(keyword),
      weight: String(nextWeight),
      reason: count >= 2 ? `直近コメントで${count}件反応あり` : current.reason || 'コメントから自動抽出',
      updated_at: today
    };

    if (JSON.stringify(current) !== JSON.stringify(next)) {
      map.set(keyword, next);
      changed = true;
    }
  }

  if (!changed) {
    console.log('No topic weight changes.');
    return;
  }

  const nextRows = [...map.values()].sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  fs.writeFileSync(WEIGHTS_PATH, toCSV(nextRows, headers), 'utf8');
  console.log(`Updated topic weights: ${nextRows.length} rows.`);
}

main();
