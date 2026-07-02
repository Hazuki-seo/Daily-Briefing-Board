const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./csv-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SITE_DIR = path.join(ROOT, 'site');
const DIST_DIR = path.join(ROOT, 'dist');

function readCSV(name) {
  const filePath = path.join(DATA_DIR, name);
  const text = fs.readFileSync(filePath, 'utf8');
  return parseCSV(text);
}

function writeJSON(relativePath, data) {
  const filePath = path.join(DIST_DIR, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countBySection(items, section) {
  return items.filter(item => item.section === section).length;
}

function build() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  copyDir(SITE_DIR, DIST_DIR);
  fs.copyFileSync(path.join(ROOT, '.nojekyll'), path.join(DIST_DIR, '.nojekyll'));

  const briefings = readCSV('briefings.csv');
  const comments = readCSV('comments.csv');
  const topicWeights = readCSV('topic_weights.csv');

  const dates = [...new Set(briefings.map(item => item.date).filter(Boolean))].sort();
  const latestDate = dates[dates.length - 1] || '';
  const latestItems = briefings.filter(item => item.date === latestDate);

  const archive = dates.reverse().map(date => {
    const items = briefings.filter(item => item.date === date);
    return {
      date,
      work_count: countBySection(items, 'work'),
      society_count: countBySection(items, 'society'),
      total_count: items.length
    };
  });

  writeJSON('data/briefings.json', briefings);
  writeJSON('data/comments.json', comments);
  writeJSON('data/topic_weights.json', topicWeights);
  writeJSON('data/latest.json', { date: latestDate, items: latestItems });
  writeJSON('data/archive.json', archive);

  console.log(`Built site for ${latestDate || 'no date'} with ${latestItems.length} latest items.`);
}

build();
