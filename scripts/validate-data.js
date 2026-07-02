const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./csv-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const requirements = {
  'briefings.csv': ['date', 'id', 'section', 'category', 'source_name', 'event_date', 'location', 'actor', 'title', 'summary', 'source_url', 'source_image_url', 'what_happened', 'background', 'watch_point', 'work_hint', 'importance'],
  'comments.csv': ['created_at', 'briefing_id', 'name', 'comment', 'related_url', 'tags', 'status'],
  'topic_weights.csv': ['keyword', 'category', 'weight', 'reason', 'updated_at']
};

let hasError = false;

for (const [fileName, requiredHeaders] of Object.entries(requirements)) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${fileName}`);
    hasError = true;
    continue;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const headers = firstLine.split(',').map(value => value.replaceAll('"', '').trim());

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      console.error(`${fileName}: missing header ${header}`);
      hasError = true;
    }
  }

  const rows = parseCSV(text);
  console.log(`${fileName}: ${rows.length} rows`);
}

if (hasError) process.exit(1);
