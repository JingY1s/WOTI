/* ========================================
   WOTI — 坦克世界玩家人格测试 核心逻辑
   Supabase 优先 + 本地 JSON 回退
   ======================================== */

// ===== 全局状态 =====
let questionsData = null;
let typesData = null;
let currentQuestion = 0;
let answers = {};
let currentResult = null;
let useSupabase = false; // 是否成功连接 Supabase
const VISITOR_ID_KEY = 'woti_visitor_id';
const LAST_RESULT_KEY = 'woti_last_result';
const WALL_KEY = 'woti_wall_messages';

// 维度定义辅助函数（从 questionsData.dimensions 读取）
function getDims() {
  if (questionsData && questionsData.dimensions) return questionsData.dimensions;
  // 默认兜底
  return [
    { key: 'AD', nameA: '进攻', letterA: 'A', nameB: '防守', letterB: 'D' },
    { key: 'ST', nameA: '独狼', letterA: 'S', nameB: '团队', letterB: 'T' },
    { key: 'CR', nameA: '沉稳', letterA: 'C', nameB: '暴躁', letterB: 'R' },
    { key: 'HF', nameA: '硬核', letterA: 'H', nameB: '娱乐', letterB: 'F' }
  ];
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[init] 开始加载数据, supabaseEnabled:', supabaseEnabled());
    // 尝试 Supabase，失败则回退本地 JSON
    if (supabaseEnabled()) {
      try {
        const [qData, tData] = await Promise.all([sbLoadQuestions(), sbLoadTypes()]);
        console.log('[init] Supabase 返回:', { qCount: qData.questions.length, tCount: tData.types.length });
        if (qData.questions.length > 0 && tData.types.length > 0) {
          questionsData = qData;
          typesData = tData;
          useSupabase = true;
          console.log('[init] ✅ Supabase 数据加载成功');
        } else {
          throw new Error('Supabase 数据为空，回退本地');
        }
      } catch (e) {
        console.warn('[init] ⚠️ Supabase 加载失败:', e.message);
      }
    }

    if (!useSupabase) {
      console.log('[init] 使用本地 JSON 兜底');
      const [qRes, tRes] = await Promise.all([
        fetch('data/questions.json').then(r => r.json()),
        fetch('data/types.json').then(r => r.json())
      ]);
      questionsData = qRes;
      typesData = tRes;
    }

    console.log('[init] 最终数据:', { types: typesData?.types?.length, questions: questionsData?.questions?.length });

    initWallTypeSelect();
    initWallFilters();
    loadWallMessages();
    renderHomeDims();

    // 检查 hash 路由
    if (location.hash === '#admin') {
      showPage('page-admin');
      initAdmin();
    }
  } catch (e) {
    console.error('数据加载失败:', e);
  }
});

// hash 路由监听
window.addEventListener('hashchange', () => {
  if (location.hash === '#admin') {
    showPage('page-admin');
    initAdmin();
  }
});

// ===== 页面导航 =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    target.scrollTop = 0;
    window.scrollTo(0, 0);
  }
}

// ===== 答题流程 =====
function startQuiz() {
  currentQuestion = 0;
  answers = {};
  showPage('page-quiz');
  renderQuestion();
}

function restartQuiz() {
  startQuiz();
}

function renderQuestion() {
  const questions = questionsData.questions;
  const q = questions[currentQuestion];
  const total = questions.length;

  document.getElementById('progress-fill').style.width = ((currentQuestion + 1) / total * 100) + '%';
  document.getElementById('quiz-count').textContent = (currentQuestion + 1) + '/' + total;

  const chapter = questionsData.chapters.find(c => c.id === q.chapter);
  const chapterEl = document.getElementById('quiz-chapter');
  if (chapter) {
    chapterEl.textContent = chapter.subtitle + ' · ' + chapter.name;
    chapterEl.style.display = '';
  } else {
    chapterEl.style.display = 'none';
  }

  document.getElementById('quiz-question').textContent = q.text;

  const optionsEl = document.getElementById('quiz-options');
  optionsEl.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt.text;
    if (answers[q.id] === opt.value) btn.classList.add('selected');
    btn.addEventListener('click', (e) => selectOption(q.id, opt.value, e));
    optionsEl.appendChild(btn);
  });
}

function selectOption(questionId, value, e) {
  answers[questionId] = value;
  document.querySelectorAll('.quiz-option').forEach(btn => btn.classList.remove('selected'));
  e.currentTarget.classList.add('selected');

  setTimeout(() => {
    if (currentQuestion < questionsData.questions.length - 1) {
      currentQuestion++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  }, 250);
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
  } else {
    showPage('page-home');
  }
}

// ===== 计算结果 =====
function finishQuiz() {
  showPage('page-loading');
  setTimeout(() => {
    const result = calculateResult();
    currentResult = result;
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
    renderResult(result);
    showPage('page-result');
  }, 2000);
}

function calculateResult() {
  const dims = getDims();
  const dimScores = {};
  const dimCounts = {};
  dims.forEach(d => { dimScores[d.key] = 0; dimCounts[d.key] = 0; });

  const questions = questionsData.questions;
  questions.forEach(q => {
    const ans = answers[q.id];
    if (!ans) return;
    const dim = dims.find(d => d.key === q.dimension);
    if (!dim) return;
    dimCounts[q.dimension]++;
    if (ans === dim.letterA) dimScores[q.dimension]++;
    else dimScores[q.dimension]--;
  });

  const dimPercent = {};
  const dimResult = {};
  dims.forEach(d => {
    const max = dimCounts[d.key] || 1;
    dimPercent[d.key] = Math.round(((dimScores[d.key] + max) / (2 * max)) * 100);
    dimResult[d.key] = dimPercent[d.key] >= 50 ? d.letterA : d.letterB;
  });

  const hiddenResult = checkHiddenTriggers(dimPercent, dimResult);
  if (hiddenResult) return { type: hiddenResult, dimPercent, dimResult, isHidden: true };

  const matched = typesData.types.find(t =>
    t.dims.AD === dimResult.AD && t.dims.ST === dimResult.ST &&
    t.dims.CR === dimResult.CR && t.dims.HF === dimResult.HF
  );

  return { type: matched || typesData.types[0], dimPercent, dimResult, isHidden: false };
}

function checkHiddenTriggers(dimPercent) {
  if (!typesData.hidden || typesData.hidden.length === 0) return null;
  for (const h of typesData.hidden) {
    if (h.trigger === 'all_extreme') {
      if (Object.values(dimPercent).every(v => v >= 90 || v <= 10)) return h;
    }
  }
  return null;
}

// ===== 渲染结果页 =====
function renderResult(result) {
  const t = result.type;
  document.getElementById('result-badge').textContent = t.code;
  document.getElementById('result-title').textContent = t.name;
  document.getElementById('result-oneliner').textContent = t.oneliner;

  const tagsEl = document.getElementById('result-tags');
  tagsEl.innerHTML = '';
  if (t.tags && Array.isArray(t.tags)) {
    t.tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'result-tag';
      span.textContent = tag;
      tagsEl.appendChild(span);
    });
  }

  const descEl = document.getElementById('result-desc');
  descEl.innerHTML = t.description
    ? t.description.split('\n').map(p => '<p>' + escapeHtml(p) + '</p>').join('')
    : '<p>待补充</p>';

  document.getElementById('result-vehicle').textContent = t.vehicle || '待补充';

  const quoteEl = document.getElementById('result-quote');
  quoteEl.textContent = t.quote || '';
  quoteEl.style.display = t.quote && t.quote !== '待补充' ? '' : 'none';

  renderDimBars(result.dimPercent);
}

function renderDimBars(dimPercent) {
  const container = document.getElementById('result-dimensions');
  const dims = getDims();
  container.innerHTML = '';
  dims.forEach(d => {
    const pct = dimPercent[d.key] || 50;
    const row = document.createElement('div');
    row.className = 'dim-bar-row';
    row.innerHTML =
      '<span class="dim-bar-label">' + escapeHtml(d.letterA + ' ' + d.nameA) + '</span>' +
      '<div class="dim-bar-track"><div class="dim-bar-fill" style="width:0%"></div></div>' +
      '<span class="dim-bar-label-right">' + escapeHtml(d.letterB + ' ' + d.nameB) + '</span>';
    container.appendChild(row);
    requestAnimationFrame(() => {
      row.querySelector('.dim-bar-fill').style.width = pct + '%';
    });
  });
}

// ===== 分享卡片（Canvas 绘制）=====
function generateShareCard() {
  if (!currentResult) return;
  const canvas = document.getElementById('share-canvas');
  const ctx = canvas.getContext('2d');
  const t = currentResult.type;
  const dpr = window.devicePixelRatio || 2;
  const W = 640, H = 900;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W / 2 + 'px';
  canvas.style.height = H / 2 + 'px';
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#FAF8F3';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#5B8C3E';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  drawCorner(ctx, 16, 16, 20, '#5B8C3E');
  drawCorner(ctx, W - 16, 16, 20, '#5B8C3E', true, false);
  drawCorner(ctx, 16, H - 16, 20, '#5B8C3E', false, true);
  drawCorner(ctx, W - 16, H - 16, 20, '#5B8C3E', true, true);

  ctx.fillStyle = '#5B8C3E';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('W.O.T.I', W / 2, 70);

  ctx.fillStyle = '#6B7C6E';
  ctx.font = '14px sans-serif';
  ctx.fillText('坦克世界玩家人格测试', W / 2, 95);

  ctx.fillStyle = '#5B8C3E';
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText(t.code, W / 2, 190);

  ctx.fillStyle = '#2D3A2E';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(t.name, W / 2, 240);

  ctx.fillStyle = '#6B7C6E';
  ctx.font = '16px sans-serif';
  wrapText(ctx, t.oneliner || '', W / 2, 275, W - 100, 22);

  if (t.tags && t.tags.length > 0 && t.tags[0] !== '待补充') {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#5B8C3E';
    ctx.fillText(t.tags.join('  ·  '), W / 2, 320);
  }

  const dimLabels = getDims();
  let barY = 370;
  const barX = 100, barW = W - 200, barH = 12;

  dimLabels.forEach(d => {
    const pct = (currentResult.dimPercent[d.key] || 50) / 100;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5B8C3E';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(d.nameA, barX - 12, barY + 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6B7C6E';
    ctx.fillText(d.nameB, barX + barW + 12, barY + 10);

    ctx.fillStyle = '#E8E5DC';
    roundRect(ctx, barX, barY, barW, barH, 6);
    ctx.fill();
    ctx.fillStyle = '#5B8C3E';
    roundRect(ctx, barX, barY, Math.max(barH, barW * pct), barH, 6);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#2D3A2E';
    ctx.font = '12px sans-serif';
    ctx.fillText(Math.round(pct * 100) + '%', barX + barW * pct, barY - 6);
    barY += 50;
  });

  if (t.vehicle && t.vehicle !== '待补充') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6B7C6E';
    ctx.font = '14px sans-serif';
    ctx.fillText('代表车辆', W / 2, barY + 20);
    ctx.fillStyle = '#5B8C3E';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(t.vehicle, W / 2, barY + 50);
    barY += 70;
  }

  if (t.quote && t.quote !== '待补充') {
    ctx.fillStyle = '#8B7D5E';
    ctx.font = 'italic 15px sans-serif';
    wrapText(ctx, '\u201C' + t.quote + '\u201D', W / 2, barY + 20, W - 120, 22);
  }

  ctx.fillStyle = '#C5C0B5';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('woti.pages.dev \u00B7 仅供娱乐', W / 2, H - 40);

  document.getElementById('share-modal').classList.remove('hidden');
}

function drawCorner(ctx, x, y, size, color, flipX, flipY) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const dx = flipX ? -1 : 1, dy = flipY ? -1 : 1;
  ctx.moveTo(x, y + dy * size);
  ctx.lineTo(x, y);
  ctx.lineTo(x + dx * size, y);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '', lineY = y;
  for (let i = 0; i < text.length; i++) {
    const testLine = line + text[i];
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line, x, lineY);
      line = text[i];
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, lineY);
}

function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

function downloadShareCard() {
  const canvas = document.getElementById('share-canvas');
  const link = document.createElement('a');
  link.download = 'WOTI-' + (currentResult ? currentResult.type.code : 'result') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ===== 首页维度标签动态渲染 =====
function renderHomeDims() {
  const container = document.getElementById('home-dims');
  if (!container) return;
  const dims = getDims();
  container.innerHTML = '';
  dims.forEach(d => {
    const tag = document.createElement('div');
    tag.className = 'dim-tag';
    tag.innerHTML = '<span class="dim-letter">' + escapeHtml(d.letterA) + '</span>' +
      escapeHtml(d.nameA) + ' / ' +
      '<span class="dim-letter">' + escapeHtml(d.letterB) + '</span>' +
      escapeHtml(d.nameB);
    container.appendChild(tag);
  });
}

// ===== 留言墙（Supabase 优先 + localStorage 回退）=====
function getVisitorId() {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

function initWallTypeSelect() {
  const select = document.getElementById('wall-type');
  if (!typesData) return;
  typesData.types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.code;
    opt.textContent = t.code + ' \u00B7 ' + t.name;
    select.appendChild(opt);
  });
}

async function postMessage() {
  const nickname = document.getElementById('wall-nickname').value.trim();
  const type = document.getElementById('wall-type').value;
  const message = document.getElementById('wall-message').value.trim();

  if (!nickname) { alert('请输入游戏昵称'); return; }
  if (!message) { alert('请输入留言内容'); return; }

  const msg = {
    visitorId: getVisitorId(),
    nickname,
    type: type || null,
    message
  };

  if (useSupabase) {
    try {
      await sbPostWallMessage(msg);
    } catch (e) {
      console.warn('Supabase 发送失败，存本地:', e);
      saveLocalWallMessage(msg);
    }
  } else {
    saveLocalWallMessage(msg);
  }

  document.getElementById('wall-nickname').value = '';
  document.getElementById('wall-message').value = '';
  document.getElementById('wall-type').selectedIndex = 0;
  loadWallMessages();
}

function saveLocalWallMessage(msg) {
  const msgs = getLocalWallMessages();
  msgs.unshift({
    id: Date.now(),
    visitor_id: msg.visitorId,
    nickname: msg.nickname,
    type_code: msg.type,
    message: msg.message,
    created_at: new Date().toISOString()
  });
  localStorage.setItem(WALL_KEY, JSON.stringify(msgs));
}

function getLocalWallMessages() {
  try {
    return JSON.parse(localStorage.getItem(WALL_KEY)) || [];
  } catch { return []; }
}

async function loadWallMessages(filter) {
  let msgs = [];
  if (useSupabase) {
    try {
      msgs = await sbLoadWallMessages();
    } catch (e) {
      console.warn('Supabase 加载留言失败:', e);
      msgs = getLocalWallMessages();
    }
  } else {
    msgs = getLocalWallMessages();
  }

  const container = document.getElementById('wall-messages');
  const visitorId = getVisitorId();

  let filtered = msgs;
  if (filter === 'mine') {
    filtered = msgs.filter(m => m.visitor_id === visitorId);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p class="wall-empty">还没有留言，来做第一个发言的车长吧！</p>';
    return;
  }

  container.innerHTML = '';
  filtered.forEach(m => {
    const div = document.createElement('div');
    div.className = 'wall-msg';
    const timeStr = formatTime(m.created_at);
    const typeTag = m.type_code ? '<span class="wall-msg-type">' + escapeHtml(m.type_code) + '</span>' : '';
    const isMine = m.visitor_id === visitorId;
    const deleteBtn = isMine ?
      '<button class="wall-msg-delete" onclick="deleteMessage(' + m.id + ')">删除</button>' : '';

    div.innerHTML =
      '<div class="wall-msg-header">' +
        '<span class="wall-msg-nick">' + escapeHtml(m.nickname) + '</span>' +
        typeTag +
        '<span class="wall-msg-time">' + timeStr + '</span>' +
      '</div>' +
      '<div class="wall-msg-body">' + escapeHtml(m.message) + '</div>' +
      deleteBtn;
    container.appendChild(div);
  });
}

async function deleteMessage(id) {
  if (useSupabase) {
    try {
      await sbDeleteWallMessage(id, getVisitorId());
    } catch (e) {
      console.warn('Supabase 删除失败:', e);
    }
  } else {
    let msgs = getLocalWallMessages();
    msgs = msgs.filter(m => m.id !== id);
    localStorage.setItem(WALL_KEY, JSON.stringify(msgs));
  }
  const activeFilter = document.querySelector('.filter-btn.active');
  loadWallMessages(activeFilter ? activeFilter.dataset.filter : 'all');
}

function initWallFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadWallMessages(btn.dataset.filter);
    });
  });
}

// ===== 管理面板 =====
let adminEditingTypes = [];
let adminEditingQuestions = [];

function initAdmin() {
  const panel = document.getElementById('admin-panel');
  const login = document.getElementById('admin-login');
  if (!panel || !login) return;

  if (isAdmin()) {
    login.style.display = 'none';
    panel.style.display = '';
    loadAdminData();
  } else {
    login.style.display = '';
    panel.style.display = 'none';
  }
}

function adminDoLogin() {
  const pwd = document.getElementById('admin-pwd').value;
  if (adminLogin(pwd)) {
    initAdmin();
  } else {
    alert('密码错误');
  }
}

function adminDoLogout() {
  adminLogout();
  initAdmin();
}

function loadAdminData() {
  console.log('[admin] loadAdminData called', { typesData, questionsData, useSupabase });
  if (!typesData || !typesData.types) {
    console.error('[admin] typesData 未加载', typesData);
    alert('数据加载失败，请刷新页面重试');
    return;
  }
  if (!questionsData || !questionsData.questions) {
    console.error('[admin] questionsData 未加载', questionsData);
    alert('题库未加载，请刷新页面重试');
    return;
  }
  adminEditingTypes = JSON.parse(JSON.stringify(typesData.types));
  if (typesData.hidden) {
    typesData.hidden.forEach(h => {
      const copy = JSON.parse(JSON.stringify(h));
      copy.is_hidden = true;
      adminEditingTypes.push(copy);
    });
  }
  // 记录原始 code，用于 code 被修改后仍能定位数据库记录
  adminEditingTypes.forEach(t => { t._originalCode = t.code; });
  adminEditingQuestions = JSON.parse(JSON.stringify(questionsData.questions));
  console.log('[admin] 数据准备完成', {
    types: adminEditingTypes.length,
    questions: adminEditingQuestions.length
  });
  renderAdminDims();
  renderLogicFlow();
  renderAdminTypes();
  renderAdminQuestions();
}

// ===== 逻辑概览（可视化维度→类型映射）=====
function renderLogicFlow() {
  const container = document.getElementById('logic-flow');
  if (!container) return;
  const dims = getDims();
  const allTypes = [...typesData.types, ...(typesData.hidden || [])];

  // 构建一个树形视图
  let html = '<div class="logic-tree">';

  // 维度标题行
  html += '<div class="logic-dims-row">';
  dims.forEach(d => {
    html += '<div class="logic-dim-chip">' +
      '<span class="dim-letter">' + escapeHtml(d.letterA) + '</span>' + escapeHtml(d.nameA) +
      ' / ' +
      '<span class="dim-letter">' + escapeHtml(d.letterB) + '</span>' + escapeHtml(d.nameB) +
      '</div>';
  });
  html += '</div>';

  // 类型映射表
  html += '<table class="logic-table"><thead><tr>';
  dims.forEach(d => { html += '<th>' + escapeHtml(d.key) + '</th>'; });
  html += '<th>类型</th><th>名称</th></tr></thead><tbody>';

  allTypes.forEach(t => {
    html += '<tr' + (t.is_hidden ? ' class="logic-hidden-row"' : '') + '>';
    dims.forEach(d => {
      const val = t.dims ? t.dims[d.key] : '?';
      const isA = val === d.letterA;
      html += '<td><span class="logic-cell ' + (isA ? 'logic-cell-a' : 'logic-cell-b') + '">' +
        escapeHtml(val || '?') + '</span></td>';
    });
    html += '<td><strong>' + escapeHtml(t.code) + '</strong></td>';
    html += '<td>' + escapeHtml(t.name) + (t.is_hidden ? ' <small>(隐藏)</small>' : '') + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ===== 维度编辑 =====
function renderAdminDims() {
  const list = document.getElementById('admin-dims-list');
  if (!list) return;
  const dims = getDims();
  list.innerHTML = '';
  dims.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'admin-card';
    card.innerHTML =
      '<div class="admin-card-header" onclick="toggleAdminCard(this)">' +
        '<strong>' + escapeHtml(d.key) + '</strong> · ' +
        escapeHtml(d.letterA + ' ' + d.nameA + ' / ' + d.letterB + ' ' + d.nameB) +
      '</div>' +
      '<div class="admin-card-body" style="display:none">' +
        '<div class="admin-dim-row">' +
          '<label>维度 Key<input type="text" class="wall-input" value="' + escAttr(d.key) + '" readonly style="opacity:0.5;cursor:not-allowed" title="Key 是内部标识符，不可修改，否则会破坏人格类型映射"></label>' +
        '</div>' +
        '<div class="admin-dim-pair">' +
          '<div class="admin-dim-half">' +
            '<p class="admin-dim-pole-title">A 极</p>' +
            '<label>字母<input type="text" class="wall-input" value="' + escAttr(d.letterA) + '" maxlength="2" data-didx="' + i + '" data-dfield="letterA" onchange="adminDimChanged(this)"></label>' +
            '<label>名称<input type="text" class="wall-input" value="' + escAttr(d.nameA) + '" data-didx="' + i + '" data-dfield="nameA" onchange="adminDimChanged(this)"></label>' +
          '</div>' +
          '<div class="admin-dim-half">' +
            '<p class="admin-dim-pole-title">B 极</p>' +
            '<label>字母<input type="text" class="wall-input" value="' + escAttr(d.letterB) + '" maxlength="2" data-didx="' + i + '" data-dfield="letterB" onchange="adminDimChanged(this)"></label>' +
            '<label>名称<input type="text" class="wall-input" value="' + escAttr(d.nameB) + '" data-didx="' + i + '" data-dfield="nameB" onchange="adminDimChanged(this)"></label>' +
          '</div>' +
        '</div>' +
        '<label>说明<input type="text" class="wall-input" value="' + escAttr(d.description || '') + '" data-didx="' + i + '" data-dfield="description" onchange="adminDimChanged(this)"></label>' +
      '</div>';
    list.appendChild(card);
  });
}

function adminDimChanged(el) {
  const idx = parseInt(el.dataset.didx);
  const field = el.dataset.dfield;
  // 如果还没有 dimensions（从 Supabase 加载但表为空），用 getDims() 初始化
  if (!questionsData.dimensions) {
    questionsData.dimensions = getDims();
  }
  questionsData.dimensions[idx][field] = el.value;
}

async function saveAdminDims() {
  if (useSupabase) {
    try {
      await sbSaveAllDimensions(questionsData.dimensions || getDims());
      renderHomeDims();
      renderLogicFlow();
      alert('维度已保存到云端');
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  } else {
    renderHomeDims();
    renderLogicFlow();
    alert('维度已更新（仅当前会话，请导出 JSON 保留）');
  }
}

function renderAdminTypes() {
  const list = document.getElementById('admin-types-list');
  list.innerHTML = '';
  const dims = getDims();
  adminEditingTypes.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'admin-card';
    // 维度选择行：每个维度一个下拉，选 letterA 或 letterB，强制一排不换行
    const dimSelects = dims.map(d => {
      const curVal = (t.dims && t.dims[d.key]) || '';
      return '<label style="flex:1">' + escapeHtml(d.key) +
        '<select class="wall-select" data-field="dim_' + escAttr(d.key) + '" data-idx="' + i + '" onchange="adminTypeChanged(this)">' +
          '<option value=""' + (!curVal ? ' selected' : '') + '>?</option>' +
          '<option value="' + escAttr(d.letterA) + '"' + (curVal === d.letterA ? ' selected' : '') + '>' + escapeHtml(d.letterA + '·' + d.nameA) + '</option>' +
          '<option value="' + escAttr(d.letterB) + '"' + (curVal === d.letterB ? ' selected' : '') + '>' + escapeHtml(d.letterB + '·' + d.nameB) + '</option>' +
        '</select></label>';
    }).join('');
    card.innerHTML =
      '<div class="admin-card-header" onclick="toggleAdminCard(this)">' +
        '<strong>' + escapeHtml(t.code) + '</strong> · ' + escapeHtml(t.name) +
        (t.is_hidden ? ' <span class="result-tag">隐藏</span>' : '') +
      '</div>' +
      '<div class="admin-card-body" style="display:none">' +
        '<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:8px">' +
          '<label style="flex:1">外显代码（4字母）<input type="text" class="wall-input" value="' + escAttr(t.code) + '" maxlength="8" data-field="code" data-idx="' + i + '" onchange="adminTypeChanged(this)"></label>' +
          '<label style="flex:2">名称<input type="text" class="wall-input" value="' + escAttr(t.name) + '" data-field="name" data-idx="' + i + '" onchange="adminTypeChanged(this)"></label>' +
        '</div>' +
        '<div style="margin-bottom:4px;font-size:13px;color:var(--text-dim)">维度归属（A极=维度第一字母，B极=维度第二字母）</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:12px">' + dimSelects + '</div>' +
        '<label>一句话<input type="text" class="wall-input" value="' + escAttr(t.oneliner) + '" data-field="oneliner" data-idx="' + i + '" onchange="adminTypeChanged(this)"></label>' +
        '<label>标签（逗号分隔）<input type="text" class="wall-input" value="' + escAttr(Array.isArray(t.tags) ? t.tags.join(', ') : '') + '" data-field="tags" data-idx="' + i + '" onchange="adminTypeChanged(this)"></label>' +
        '<label>描述<textarea class="wall-textarea" rows="4" data-field="description" data-idx="' + i + '" onchange="adminTypeChanged(this)">' + escapeHtml(t.description || '') + '</textarea></label>' +
        '<label>代表车辆<input type="text" class="wall-input" value="' + escAttr(t.vehicle) + '" data-field="vehicle" data-idx="' + i + '" onchange="adminTypeChanged(this)"></label>' +
        '<label>语录<input type="text" class="wall-input" value="' + escAttr(t.quote) + '" data-field="quote" data-idx="' + i + '" onchange="adminTypeChanged(this)"></label>' +
        '<button class="btn-primary" style="margin-top:8px" onclick="saveAdminType(' + i + ')">保存此类型</button>' +
      '</div>';
    list.appendChild(card);
  });
}

function renderAdminQuestions() {
  const list = document.getElementById('admin-questions-list');
  list.innerHTML = '';
  const dims = getDims();
  adminEditingQuestions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'admin-card';
    const dimOptions = dims.map(d =>
      '<option value="' + escAttr(d.key) + '"' + (q.dimension === d.key ? ' selected' : '') + '>' +
      escapeHtml(d.key + ' ' + d.nameA + '/' + d.nameB) + '</option>'
    ).join('');
    // 找当前维度，用于在选项标签上标注对应字母
    const curDim = dims.find(d => d.key === q.dimension) || dims[0];
    const labelA = '选项A（→ ' + (curDim ? curDim.letterA + ' ' + curDim.nameA : 'A极') + '）';
    const labelB = '选项B（→ ' + (curDim ? curDim.letterB + ' ' + curDim.nameB : 'B极') + '）';
    card.innerHTML =
      '<div class="admin-card-header" onclick="toggleAdminCard(this)">' +
        '<strong>Q' + q.id + '</strong> · ' + escapeHtml(q.text.slice(0, 30)) + '...' +
      '</div>' +
      '<div class="admin-card-body" style="display:none">' +
        '<label>维度<select class="wall-select" data-field="dimension" data-idx="' + i + '" onchange="adminQChanged(this)">' +
          dimOptions +
        '</select></label>' +
        '<label>题目<textarea class="wall-textarea" rows="2" data-field="text" data-idx="' + i + '" onchange="adminQChanged(this)">' + escapeHtml(q.text) + '</textarea></label>' +
        '<label>' + escapeHtml(labelA) + '<input type="text" class="wall-input" value="' + escAttr(q.options[0].text) + '" data-field="optA" data-idx="' + i + '" onchange="adminQChanged(this)"></label>' +
        '<label>' + escapeHtml(labelB) + '<input type="text" class="wall-input" value="' + escAttr(q.options[1].text) + '" data-field="optB" data-idx="' + i + '" onchange="adminQChanged(this)"></label>' +
        '<button class="btn-primary" style="margin-top:8px" onclick="saveAdminQuestion(' + i + ')">保存此题</button>' +
      '</div>';
    list.appendChild(card);
  });
}

function toggleAdminCard(header) {
  const body = header.nextElementSibling;
  body.style.display = body.style.display === 'none' ? '' : 'none';
}

function adminTypeChanged(el) {
  const idx = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  if (field === 'tags') {
    adminEditingTypes[idx].tags = el.value.split(',').map(s => s.trim()).filter(Boolean);
  } else if (field.startsWith('dim_')) {
    // 维度字母修改，如 dim_AD → dims.AD
    const dimKey = field.slice(4);
    if (!adminEditingTypes[idx].dims) adminEditingTypes[idx].dims = {};
    adminEditingTypes[idx].dims[dimKey] = el.value;
  } else {
    adminEditingTypes[idx][field] = el.value;
  }
}

function adminQChanged(el) {
  const idx = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  if (field === 'optA') adminEditingQuestions[idx].options[0].text = el.value;
  else if (field === 'optB') adminEditingQuestions[idx].options[1].text = el.value;
  else adminEditingQuestions[idx][field] = el.value;
}

async function saveAdminType(idx) {
  const t = adminEditingTypes[idx];
  const oldCode = t._originalCode || t.code; // 先保存旧 code，再改引用
  if (useSupabase) {
    try {
      await sbSaveType(t);
      // 保存成功后更新 _originalCode（下次再改 code 时用新值定位）
      adminEditingTypes[idx]._originalCode = t.code;
      // 用 oldCode 定位 typesData 里的旧记录并替换
      if (t.is_hidden) {
        const hiddenIdx = typesData.hidden.findIndex(h => h.code === oldCode);
        if (hiddenIdx >= 0) typesData.hidden[hiddenIdx] = { ...t };
      } else {
        const typeIdx = typesData.types.findIndex(tp => tp.code === oldCode);
        if (typeIdx >= 0) typesData.types[typeIdx] = { ...t };
      }
      alert('已保存到云端');
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  } else {
    // 离线模式：更新内存数据
    updateLocalTypesData();
    alert('已保存（仅当前会话，请导出 JSON 保留）');
  }
}

async function saveAdminQuestion(idx) {
  const q = adminEditingQuestions[idx];
  if (useSupabase) {
    try {
      await sbSaveQuestion(q);
      // 直接更新内存，不重新拉取全量数据
      const qIdx = questionsData.questions.findIndex(x => x.id === q.id);
      if (qIdx >= 0) questionsData.questions[qIdx] = { ...q };
      alert('已保存到云端');
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  } else {
    updateLocalQuestionsData();
    alert('已保存（仅当前会话，请导出 JSON 保留）');
  }
}

function updateLocalTypesData() {
  typesData.types = adminEditingTypes.filter(t => !t.is_hidden);
  typesData.hidden = adminEditingTypes.filter(t => t.is_hidden);
}

function updateLocalQuestionsData() {
  questionsData.questions = adminEditingQuestions;
}

// ===== 导入/导出 =====
function exportTypesJson() {
  const data = { types: typesData.types, hidden: typesData.hidden || [] };
  downloadJson(data, 'woti-types.json');
}

function exportQuestionsJson() {
  const data = {
    dimensions: questionsData.dimensions || getDims(),
    chapters: questionsData.chapters,
    questions: questionsData.questions
  };
  downloadJson(data, 'woti-questions.json');
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function importTypesJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.types || !Array.isArray(data.types)) throw new Error('无效的 types.json 格式');

      if (useSupabase) {
        await sbBulkImportTypes(data);
        typesData = await sbLoadTypes();
      } else {
        typesData = data;
      }
      loadAdminData();
      alert('导入成功！共 ' + (data.types.length + (data.hidden || []).length) + ' 个类型');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  input.click();
}

function importQuestionsJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.questions || !Array.isArray(data.questions)) throw new Error('无效的 questions.json 格式');

      if (useSupabase) {
        await sbBulkImportQuestions(data);
        questionsData = await sbLoadQuestions();
      } else {
        questionsData = data;
      }
      loadAdminData();
      alert('导入成功！共 ' + data.questions.length + ' 道题');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  input.click();
}

// ===== 工具函数 =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const diff = Date.now() - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return (d.getMonth() + 1) + '/' + d.getDate();
}
