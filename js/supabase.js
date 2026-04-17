/* ========================================
   WOTI — Supabase 数据层
   封装所有数据库操作，app.js 通过此模块读写数据
   ======================================== */

// ===== 配置 =====
// 部署前替换为你自己的 Supabase 项目信息
const SUPABASE_URL = 'https://htzavddjrbrdtvrtplqa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0emF2ZGRqcmJyZHR2cnRwbHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzUxMzMsImV4cCI6MjA5MTkxMTEzM30.tIQRn0u8nU2EdMbVeleJSGoS40HuHefAlVgszuneFRs';

// 管理密码（简单方案：硬编码或存 config 表）
const ADMIN_PASSWORD = 'woti2026';

// ===== Supabase 轻量客户端（无需 SDK）=====
const supabaseEnabled = () => SUPABASE_URL && SUPABASE_ANON_KEY;

function sbHeaders(asAdmin) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  if (asAdmin) {
    headers['Authorization'] = 'Bearer ' + SUPABASE_ANON_KEY;
  }
  return headers;
}

async function sbFetch(path, options = {}) {
  if (!supabaseEnabled()) throw new Error('Supabase 未配置');
  const url = SUPABASE_URL + '/rest/v1/' + path;
  const res = await fetch(url, {
    headers: sbHeaders(options.admin),
    ...options
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase 错误: ' + res.status + ' ' + err);
  }
  // 处理空响应（204 No Content 或 return=minimal）
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// ===== Types CRUD =====
async function sbLoadTypes() {
  const rows = await sbFetch('types?order=sort_order.asc,code.asc&select=*');
  // 转换为 app.js 期望的格式
  const types = [];
  const hidden = [];
  rows.forEach(r => {
    const t = {
      code: r.code,
      name: r.name,
      dims: r.dims,
      oneliner: r.oneliner || '待补充',
      tags: r.tags || ['待补充'],
      description: r.description || '待补充',
      vehicle: r.vehicle || '待补充',
      quote: r.quote || '待补充',
      mirror: r.mirror,
      opposite: r.opposite
    };
    if (r.is_hidden) {
      t.trigger = r.trigger_rule || 'custom';
      hidden.push(t);
    } else {
      types.push(t);
    }
  });
  return { types, hidden };
}

async function sbSaveType(typeObj) {
  const row = {
    code: typeObj.code,
    name: typeObj.name,
    dims: typeObj.dims,
    oneliner: typeObj.oneliner,
    tags: typeObj.tags,
    description: typeObj.description,
    vehicle: typeObj.vehicle,
    quote: typeObj.quote,
    mirror: typeObj.mirror || null,
    opposite: typeObj.opposite || null,
    is_hidden: typeObj.is_hidden || false,
    trigger_rule: typeObj.trigger || null,
    updated_at: new Date().toISOString()
  };
  // 用 _originalCode 定位记录，支持 code 被修改的情况
  const patchCode = typeObj._originalCode || typeObj.code;
  return sbFetch('types?code=eq.' + patchCode, {
    method: 'PATCH',
    body: JSON.stringify(row),
    admin: true
  });
}

// ===== Questions CRUD =====
async function sbLoadQuestions() {
  const rows = await sbFetch('questions?order=sort_order.asc,id.asc&select=*');
  // 转换为 app.js 期望的格式
  const questions = rows.map(r => ({
    id: r.id,
    chapter: r.chapter,
    dimension: r.dimension,
    text: r.text,
    options: [
      { text: r.option_a_text, value: r.option_a_value },
      { text: r.option_b_text, value: r.option_b_value }
    ]
  }));
  // 推断 chapters
  const chapterMap = {
    battlefield: { id: 'battlefield', name: '战场上的你', subtitle: 'CHAPTER 1' },
    life: { id: 'life', name: '生活中的你', subtitle: 'CHAPTER 2' }
  };
  const chapters = [...new Set(rows.map(r => r.chapter))].map(c => chapterMap[c] || { id: c, name: c, subtitle: '' });

  // 同时加载维度
  let dimensions = null;
  try {
    const dimRows = await sbFetch('dimensions?order=sort_order.asc&select=*');
    dimensions = dimRows.map(d => ({
      key: d.key,
      letterA: d.letter_a,
      nameA: d.name_a,
      letterB: d.letter_b,
      nameB: d.name_b,
      description: d.description || ''
    }));
  } catch (e) {
    console.warn('[sb] dimensions 加载失败，使用默认值:', e.message);
  }

  return { chapters, questions, dimensions };
}

async function sbSaveQuestion(q) {
  const row = {
    id: q.id,
    chapter: q.chapter,
    dimension: q.dimension,
    text: q.text,
    option_a_text: q.options[0].text,
    option_a_value: q.options[0].value,
    option_b_text: q.options[1].text,
    option_b_value: q.options[1].value,
    updated_at: new Date().toISOString()
  };
  return sbFetch('questions?id=eq.' + q.id, {
    method: 'PATCH',
    body: JSON.stringify(row),
    admin: true
  });
}

// ===== Dimensions CRUD =====
async function sbSaveAllDimensions(dims) {
  // 全量替换：删除所有再插入
  await sbFetch('dimensions?key=neq.___placeholder___', { method: 'DELETE', admin: true });
  const rows = dims.map((d, i) => ({
    key: d.key,
    letter_a: d.letterA,
    name_a: d.nameA,
    letter_b: d.letterB,
    name_b: d.nameB,
    description: d.description || '',
    sort_order: i
  }));
  return sbFetch('dimensions', {
    method: 'POST',
    body: JSON.stringify(rows),
    admin: true
  });
}

// ===== Wall Messages CRUD =====
async function sbLoadWallMessages() {
  return sbFetch('wall_messages?order=created_at.desc&limit=200&select=*');
}

async function sbPostWallMessage(msg) {
  return sbFetch('wall_messages', {
    method: 'POST',
    body: JSON.stringify({
      visitor_id: msg.visitorId,
      nickname: msg.nickname,
      type_code: msg.type || null,
      message: msg.message
    })
  });
}

async function sbDeleteWallMessage(id, visitorId) {
  return sbFetch('wall_messages?id=eq.' + id + '&visitor_id=eq.' + visitorId, {
    method: 'DELETE',
    admin: true
  });
}

// ===== 批量导入（用于初始化数据库）=====
async function sbBulkImportTypes(typesJson) {
  // 先删除所有旧数据，再插入
  await sbFetch('types?code=neq.___placeholder___', { method: 'DELETE', admin: true });
  const rows = [];
  const allTypes = [...(typesJson.types || []), ...(typesJson.hidden || [])];
  allTypes.forEach((t, i) => {
    rows.push({
      code: t.code,
      name: t.name,
      dims: t.dims || {},
      oneliner: t.oneliner || '待补充',
      tags: t.tags || ['待补充'],
      description: t.description || '待补充',
      vehicle: t.vehicle || '待补充',
      quote: t.quote || '待补充',
      mirror: t.mirror || null,
      opposite: t.opposite || null,
      is_hidden: typesJson.hidden ? typesJson.hidden.includes(t) : false,
      trigger_rule: t.trigger || null,
      sort_order: i
    });
  });
  return sbFetch('types', {
    method: 'POST',
    body: JSON.stringify(rows),
    admin: true
  });
}

async function sbBulkImportQuestions(questionsJson) {
  await sbFetch('questions?id=neq.-9999', { method: 'DELETE', admin: true });
  const rows = questionsJson.questions.map((q, i) => ({
    id: q.id,
    chapter: q.chapter,
    dimension: q.dimension,
    text: q.text,
    option_a_text: q.options[0].text,
    option_a_value: q.options[0].value,
    option_b_text: q.options[1].text,
    option_b_value: q.options[1].value,
    sort_order: i
  }));
  return sbFetch('questions', {
    method: 'POST',
    body: JSON.stringify(rows),
    admin: true
  });
}

// ===== Admin 验证 =====
const ADMIN_KEY = 'woti_admin_auth';

function isAdmin() {
  return localStorage.getItem(ADMIN_KEY) === 'true';
}

function adminLogin(password) {
  if (password === ADMIN_PASSWORD) {
    localStorage.setItem(ADMIN_KEY, 'true');
    return true;
  }
  return false;
}

function adminLogout() {
  localStorage.removeItem(ADMIN_KEY);
}
