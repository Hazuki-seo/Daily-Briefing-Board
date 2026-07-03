export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, name: 'briefing-comments', version: 'v10' }, 200, env);
    }

    if (request.method === 'POST' && url.pathname === '/comment') {
      try {
        return await handleComment(request, env);
      } catch (error) {
        return json({ ok: false, message: error.message || 'Internal error' }, 500, env);
      }
    }

    return json({ ok: false, message: 'Not found' }, 404, env);
  }
};

async function handleComment(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, message: 'Invalid JSON' }, 400, env);

  // Honeypot: 画面上では見えない項目。botが入力したら成功扱いで捨てる。
  if (body.website) return json({ ok: true }, 200, env);

  if (env.SUBMIT_PASSCODE && body.passcode !== env.SUBMIT_PASSCODE) {
    return json({ ok: false, message: '合言葉が違います' }, 403, env);
  }

  const name = sanitize(body.name, 80);
  const briefingId = sanitize(body.briefing_id, 120);
  const comment = sanitize(body.comment, 1200);
  const relatedUrl = sanitize(body.related_url || '', 600);
  const tags = sanitize(body.tags || '', 240);

  if (!name || !briefingId || !comment) {
    return json({ ok: false, message: '投稿者名、対象ニュースID、コメントは必須です' }, 400, env);
  }

  if (relatedUrl && !/^https?:\/\//i.test(relatedUrl)) {
    return json({ ok: false, message: '関連URLは http または https から始めてください' }, 400, env);
  }

  const createdAt = new Date().toISOString();
  const newLine = [
    createdAt,
    briefingId,
    name,
    comment,
    relatedUrl,
    tags,
    'approved'
  ].map(csvEscape).join(',') + '\n';

  await appendToGitHubCSV(env, newLine);

  return json({ ok: true, message: '投稿しました' }, 200, env);
}

async function appendToGitHubCSV(env, newLine) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const filePath = env.COMMENTS_PATH || 'data/comments.csv';

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const file = await getGitHubFile(env, owner, repo, filePath, branch);
    const currentText = file.exists
      ? fromBase64(file.content)
      : 'created_at,briefing_id,name,comment,related_url,tags,status\n';

    const updatedText = currentText.endsWith('\n')
      ? currentText + newLine
      : currentText + '\n' + newLine;

    const result = await putGitHubFile(env, owner, repo, filePath, branch, updatedText, file.sha);
    if (result.ok) return;

    if (!isGitHubConflict(result.status) || attempt === 5) {
      throw new Error(`GitHub更新に失敗しました: ${result.message}`);
    }

    await sleep(400 * attempt);
  }
}

async function getGitHubFile(env, owner, repo, filePath, branch) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(endpoint, { headers: githubHeaders(env) });

  if (res.status === 404) return { exists: false, sha: null, content: '' };

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHubファイル取得に失敗しました: ${text}`);
  }

  const data = await res.json();
  return { exists: true, sha: data.sha, content: data.content || '' };
}

async function putGitHubFile(env, owner, repo, filePath, branch, content, sha) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(filePath)}`;
  const payload = {
    message: `Add news comment ${new Date().toISOString()}`,
    content: toBase64(content),
    branch
  };

  if (sha) payload.sha = sha;

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: githubHeaders(env),
    body: JSON.stringify(payload)
  });

  if (res.ok) return { ok: true, status: res.status, message: '' };

  const text = await res.text();
  return { ok: false, status: res.status, message: text };
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${required(env.GITHUB_TOKEN, 'GITHUB_TOKEN')}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'briefing-comments-worker'
  };
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env)
    }
  });
}

function sanitize(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function csvEscape(value) {
  const text = String(value || '');
  return `"${text.replaceAll('"', '""')}"`;
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(base64Text) {
  const binary = atob(String(base64Text || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeURIComponentPath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isGitHubConflict(status) {
  return status === 409 || status === 422;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
