function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map(header => header.trim());

  return rows.slice(1)
    .filter(values => values.some(value => String(value || '').trim() !== ''))
    .map(values => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index] || '';
      });
      return item;
    });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function toCSV(rows, headers) {
  const lines = [headers.join(',')];
  rows.forEach(row => {
    lines.push(headers.map(header => csvEscape(row[header] || '')).join(','));
  });
  return `${lines.join('\n')}\n`;
}

module.exports = { parseCSV, toCSV, csvEscape };
