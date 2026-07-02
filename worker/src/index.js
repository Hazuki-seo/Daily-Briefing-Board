export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/comment') {
      try {
        return await handleComment(request, env);
      } catch (error) {
        return json({ ok: false, message: error.message }, 500, env);
      }
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, name: 'daily-news-comment-api' }, 200, env);
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
  const briefingId = sanitize(body.briefing_id, 80);
  const comment = sanitize(body.comment, 1000);
  const relatedUrl = sanitize(body.related_url || '', 500);
  const tags = sanitize(body.tags || '', 200);

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

  return json({ ok: true }, 200, env);
}

async function appendToGitHubCSV(env, newLine) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const path = env.COMMENTS_PATH || 'data/comments.csv';

  // GitHub Contents APIは同時更新に弱いので、軽くリトライする。
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const file = await getGitHubFile(env, owner, repo, path, branch);
    const currentText = file.exists
      ? fromBase64(file.content)
      : 'created_at,briefing_id,name,comment,related_url,tags,status\n';

    const updatedText = currentText.endsWith('\n')
      ? currentText + newLine
      : currentText + '\n' + newLine;

    const result = await putGitHubFile(env, owner, repo, path, branch, updatedText, file.sha);
    if (result.ok) return;

    if (attempt === 3) {
      throw new Error(`GitHub更新に失敗しました: ${result.message}`);
    }

    await sleep(300 * attempt);
  }
}

async function getGitHubFile(env, owner, repo, path, branch) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(endpoint, { headers: githubHeaders(env) });

  if (res.status === 404) return { exists: false, sha: null, content: '' };

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHubファイル取得に失敗しました: ${text}`);
  }

  const json = await res.json();
  return { exists: true, sha: json.sha, content: json.content || '' };
}

async function putGitHubFile(env, owner, repo, path, branch, content, sha) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(path)}`;
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

  if (res.ok) return { ok: true };

  const text = await res.text();
  return { ok: false, message: text };
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${required(env.GITHUB_TOKEN, 'GITHUB_TOKEN')}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'daily-news-comment-api'
  };
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
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
  return String(value || '').trim().slice(0, maxLength);
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
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
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

function encodeURIComponentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
