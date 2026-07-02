const DATA_PATHS = {
  latest: './data/latest.json',
  archive: './data/archive.json',
  comments: './data/comments.json',
  topicWeights: './data/topic_weights.json'
};

const config = window.NEWS_BOARD_CONFIG || {};

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function commentsForBriefing(comments, briefingId) {
  return comments
    .filter(comment => comment.briefing_id === briefingId && comment.status === 'approved')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function renderComments(comments) {
  if (!comments.length) return '';

  return `
    <div class="comments">
      <strong>コメント</strong>
      ${comments.map(comment => `
        <div class="comment">
          <span class="comment-name">${escapeHTML(comment.name)}</span>
          <span class="comment-date">${escapeHTML(formatDate(comment.created_at))}</span>
          <p>${escapeHTML(comment.comment)}</p>
          ${comment.related_url ? `<a href="${escapeHTML(comment.related_url)}" target="_blank" rel="noopener">関連URL</a>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderInfoRow(label, value) {
  if (!value) return '';
  return `
    <div class="info-row">
      <span class="info-label">${escapeHTML(label)}</span>
      <span class="info-value">${escapeHTML(value)}</span>
    </div>
  `;
}

function renderSourceInfo(item) {
  const rows = [
    renderInfoRow('いつ', item.event_date || item.published_date || item.date),
    renderInfoRow('どこで', item.location),
    renderInfoRow('誰が', item.actor),
    renderInfoRow('出典', item.source_name)
  ].join('');

  if (!rows) return '';
  return `<div class="source-info">${rows}</div>`;
}

function renderDetailBlock(label, value) {
  if (!value) return '';
  return `
    <div class="news-detail-block">
      <span>${escapeHTML(label)}</span>
      <p>${escapeHTML(value)}</p>
    </div>
  `;
}

function hintLabelFor(item) {
  return item.section === 'society' ? '押さえどころ' : '活用メモ';
}

function detailLabelFor(item) {
  return item.section === 'society' ? 'なぜ重要か' : '見るポイント';
}

function renderSourceImage(item) {
  const imageUrl = item.source_image_url || item.article_image_url || '';
  if (!isHttpUrl(imageUrl)) return '';

  const caption = item.image_caption || item.source_name || '記事サムネイル';
  return `
    <figure class="article-image">
      <img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(caption)}" loading="lazy" referrerpolicy="no-referrer" />
      <figcaption>${escapeHTML(caption)}</figcaption>
    </figure>
  `;
}

function renderNewsCard(item, comments) {
  const itemComments = commentsForBriefing(comments, item.id);
  const detailBlocks = [
    renderDetailBlock('何が起きたか', item.what_happened),
    renderDetailBlock('背景・文脈', item.background),
    renderDetailBlock(detailLabelFor(item), item.watch_point)
  ].join('');

  return `
    <article class="news-card" id="${escapeHTML(item.id)}">
      <div class="news-meta">
        <span class="badge">${escapeHTML(item.category)}</span>
        <span class="news-id">${escapeHTML(item.id)}</span>
        ${item.importance ? `<span class="news-id">重要度 ${escapeHTML(item.importance)}</span>` : ''}
      </div>
      <h3>${escapeHTML(item.title)}</h3>
      <p class="news-summary">${escapeHTML(item.summary)}</p>
      ${renderSourceInfo(item)}
      ${renderSourceImage(item)}
      ${detailBlocks ? `<div class="news-details">${detailBlocks}</div>` : ''}
      ${item.work_hint ? `<p class="news-hint"><strong>${hintLabelFor(item)}：</strong>${escapeHTML(item.work_hint)}</p>` : ''}
      <div class="card-actions">
        ${item.source_url ? `<a href="${escapeHTML(item.source_url)}" target="_blank" rel="noopener">出典を見る</a>` : ''}
        <button type="button" class="comment-button secondary" data-briefing-id="${escapeHTML(item.id)}">このニュースにコメント</button>
      </div>
      ${renderComments(itemComments)}
    </article>
  `;
}

function renderArchive(archive) {
  const container = document.querySelector('#archive-list');
  if (!archive.length) {
    container.innerHTML = '<p>過去ニュースはまだありません。</p>';
    return;
  }

  container.innerHTML = archive.map(day => `
    <div class="archive-item">
      <strong>${escapeHTML(day.date)}</strong>
      <span>業務インサイト ${escapeHTML(day.work_count)}本 / 時事チェック ${escapeHTML(day.society_count)}本</span>
    </div>
  `).join('');
}

function renderTopicWeights(weights) {
  const container = document.querySelector('#topic-weights');
  if (!weights.length) {
    container.innerHTML = '<p>まだテーマの重みづけはありません。</p>';
    return;
  }

  container.innerHTML = weights
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
    .map(item => `
      <div class="topic-tag" title="${escapeHTML(item.reason)}">
        <strong>${escapeHTML(item.keyword)}</strong>
        <span> / ${escapeHTML(item.category)} / ${escapeHTML(item.weight)}</span>
      </div>
    `).join('');
}

function setupCommentButtons() {
  document.querySelectorAll('[data-briefing-id]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.querySelector('#briefing-id-input');
      input.value = button.dataset.briefingId;
      document.querySelector('#comment-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      input.focus();
    });
  });
}

async function setupCommentForm() {
  const form = document.querySelector('#comment-form');
  const message = document.querySelector('#form-message');
  const submitButton = document.querySelector('#submit-button');
  const passcodeField = document.querySelector('#passcode-field');

  if (config.PASSCODE_ENABLED) {
    passcodeField.classList.remove('hidden');
  }

  if (!config.COMMENT_API_URL) {
    message.textContent = 'コメントAPIのURLが未設定です。site/config.js の COMMENT_API_URL を設定してください。';
    submitButton.disabled = true;
    submitButton.style.opacity = '0.5';
    return;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '投稿中です...';
    submitButton.disabled = true;

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(config.COMMENT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.message || '投稿に失敗しました');
      }

      message.textContent = '投稿しました。GitHub Actionsの反映後、1〜2分ほどで画面に表示されます。';
      form.reset();
    } catch (error) {
      message.textContent = `投稿できませんでした：${error.message}`;
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function init() {
  try {
    const [latest, archive, comments, topicWeights] = await Promise.all([
      fetchJSON(DATA_PATHS.latest),
      fetchJSON(DATA_PATHS.archive),
      fetchJSON(DATA_PATHS.comments),
      fetchJSON(DATA_PATHS.topicWeights)
    ]);

    const workNews = latest.items.filter(item => item.section === 'work');
    const societyNews = latest.items.filter(item => item.section === 'society');
    const approvedComments = comments.filter(comment => comment.status === 'approved');

    document.querySelector('#today-title').textContent = `${latest.date} のブリーフィング`;
    document.querySelector('#work-count').textContent = workNews.length;
    document.querySelector('#society-count').textContent = societyNews.length;
    document.querySelector('#comment-count').textContent = approvedComments.length;

    document.querySelector('#work-news').innerHTML = workNews.map(item => renderNewsCard(item, comments)).join('');
    document.querySelector('#society-news').innerHTML = societyNews.map(item => renderNewsCard(item, comments)).join('');

    renderArchive(archive);
    renderTopicWeights(topicWeights);
    setupCommentButtons();
  } catch (error) {
    document.querySelector('#today-title').textContent = 'データを読み込めませんでした';
    document.querySelector('#work-news').innerHTML = `<p>${escapeHTML(error.message)}</p>`;
  }

  setupCommentForm();
}

init();
