/**
 * app.js - 马尔代夫选岛助手 主应用逻辑
 */

let islandsData = [];
let filters = {
  priceMin: '',
  priceMax: '',
  date: '',
  starRatings: [],
  snorkelGrades: [],
  beachGrades: [],
  transfers: [],
  crowds: [],
  meals: [],
  galaxyOnly: false,
  droneOnly: false,
  quickTag: ''
};

// 首字母背景 — 统一深色
const PHOTO_BG = '#2c2c2c';

// ===== 初始化 =====
async function init() {
  await loadData();
  setupEventListeners();
  renderIslands(islandsData);
  updateMatchCount();
}

async function loadData() {
  try {
    const res = await fetch('data.json');
    islandsData = await res.json();
  } catch (e) {
    console.error('数据加载失败:', e);
    document.getElementById('islandList').innerHTML =
      '<div class="no-result"><div class="icon">○</div><h3>加载失败</h3><p>请刷新页面重试</p></div>';
  }
}

// ===== 筛选逻辑 =====
function applyFilters() {
  return islandsData.filter(island => {
    // 预算
    if (filters.priceMin && island.价格区间.最低 < Number(filters.priceMin)) return false;
    if (filters.priceMax && island.价格区间.最高 > Number(filters.priceMax)) return false;

    // 星级
    if (filters.starRatings.length > 0) {
      if (!filters.starRatings.some(s => island.星级 === s)) return false;
    }

    // 浮潜
    if (filters.snorkelGrades.length > 0 && !filters.snorkelGrades.includes(island.浮潜评级)) return false;

    // 沙滩
    if (filters.beachGrades.length > 0 && !filters.beachGrades.includes(island.沙滩评级)) return false;

    // 上岛方式
    if (filters.transfers.length > 0 && !filters.transfers.includes(island.上岛方式)) return false;

    // 适合人群
    if (filters.crowds.length > 0) {
      if (!filters.crowds.some(c => island.适合人群.includes(c))) return false;
    }

    // 餐饮
    if (filters.meals.length > 0) {
      if (!filters.meals.some(m => island.餐饮计划.includes(m))) return false;
    }

    // 银河
    if (filters.galaxyOnly && filters.date) {
      const score = calcGalaxyScore(island);
      if (!score || !score.good) return false;
    }

    // 无人机
    if (filters.droneOnly && !island.可带无人机) return false;

    // 快捷标签
    if (filters.quickTag) {
      if (filters.quickTag === 'honeymoon' && !island.适合人群.includes('蜜月')) return false;
      if (filters.quickTag === 'photo' && island.摄影数据.光污染等级 > 3) return false;
      if (filters.quickTag === 'family' && !island.适合人群.includes('亲子')) return false;
      if (filters.quickTag === 'value' && island.价格区间.最高 > 10000) return false;
      if (filters.quickTag === 'snorkel' && island.浮潜评级 !== 'A') return false;
    }

    return true;
  });
}

function calcGalaxyScore(island) {
  if (!filters.date) return null;
  const date = new Date(filters.date);
  return window.Astro.galaxyPhotographyScore({
    date,
    lat: island.摄影数据.纬度,
    bortle: island.摄影数据.光污染等级,
    lightControl: island.摄影数据.岛上灯光控制
  });
}

// ===== 渲染 =====
function renderIslands(islands) {
  const container = document.getElementById('islandList');

  if (islands.length === 0) {
    container.innerHTML =
      '<div class="no-result"><div class="icon">○</div><h3>没有匹配的岛屿</h3><p>调整筛选条件试试</p></div>';
    return;
  }

  container.innerHTML = islands.map((island, idx) => {
    const galaxyScore = calcGalaxyScore(island);

    let galaxyTag = '';
    if (galaxyScore) {
      galaxyTag = `<span class="tag-item">${galaxyScore.good ? '○' : '○'} ${galaxyScore.score}</span>`;
    }
    const droneTag = island.可带无人机
      ? `<span class="tag-item">无人机可</span>`
      : `<span class="tag-item" style="opacity:0.35">无人机禁</span>`;

    return `
      <div class="island-card" onclick="showDetail('${island.id}')">
        <div class="photo-area" style="background:${PHOTO_BG}">
          ${island.name.charAt(0)}
        </div>
        <div class="card-body">
          <div class="card-top">
            <div>
              <span class="name">${island.name}</span>
              <span class="stars">${'☆'.repeat(Math.floor(parseFloat(island.评分)/2))}</span>
            </div>
            <div class="price">¥${(island.价格区间.最低/1000).toFixed(0)}k<span class="price-unit"> /晚起</span></div>
          </div>
          <div class="tags">
            <span class="tag-item">${island.上岛方式 === '快艇' ? '快艇' : '水飞'} ${island.上岛时间}</span>
            <span class="tag-item">浮潜${island.浮潜评级}</span>
            <span class="tag-item">沙滩${island.沙滩评级}</span>
            ${galaxyTag}
            ${droneTag}
            <span class="tag-item">${island.适合人群[0]}</span>
          </div>
          <div class="desc">${island.简介}</div>
        </div>
      </div>
    `;
  }).join('');
}

function updateMatchCount() {
  const count = applyFilters().length;
  document.getElementById('matchCount').innerHTML = `匹配 <strong>${count}</strong> 个岛屿`;
}

// ===== 详情模态框 =====
function showDetail(id) {
  const island = islandsData.find(i => i.id === id);
  if (!island) return;

  const galaxyScore = calcGalaxyScore(island);
  const modal = document.getElementById('detailModal');
  const body = document.getElementById('detailBody');

  body.innerHTML = `
    <button class="modal-close" onclick="closeDetail()">✕</button>
    <h2 style="font-size:18px;font-weight:400;margin-bottom:2px;letter-spacing:0.05em;">${island.name}</h2>
    <div style="color:#b8b7b0;font-size:12px;letter-spacing:2px;margin-bottom:16px;">
      ${'☆'.repeat(Math.floor(parseFloat(island.评分)/2))} ${island.评分}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;margin:16px 0;background:#e8e7e2;">
      <div style="background:#fafaf7;padding:14px;">
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">价格</div>
        <div style="font-weight:300;font-size:16px;color:#2c2c2c;">¥${island.价格区间.最低.toLocaleString()} – ¥${island.价格区间.最高.toLocaleString()}<span style="font-size:11px;color:#b8b7b0;font-weight:300;"> /晚</span></div>
      </div>
      <div style="background:#fafaf7;padding:14px;">
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">等级</div>
        <div style="font-weight:300;font-size:15px;">${island.星级}</div>
      </div>
      <div style="background:#fafaf7;padding:14px;">
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">上岛</div>
        <div style="font-weight:300;font-size:14px;">${island.上岛方式} · ${island.上岛时间}</div>
      </div>
      <div style="background:#fafaf7;padding:14px;">
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">适合</div>
        <div style="font-weight:300;font-size:14px;">${island.适合人群.join(' · ')}</div>
      </div>
      <div style="background:#fafaf7;padding:14px;">
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">浮潜</div>
        <div style="font-weight:300;font-size:14px;">${island.浮潜评级}级</div>
      </div>
      <div style="background:#fafaf7;padding:14px;">
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">沙滩</div>
        <div style="font-weight:300;font-size:14px;">${island.沙滩评级}级</div>
      </div>
    </div>

    ${galaxyScore ? `
    <div style="background:${galaxyScore.good ? '#f0efea' : '#f0eaeb'};padding:16px;margin:16px 0;">
      <div style="font-weight:400;margin-bottom:8px;font-size:12px;letter-spacing:0.1em;color:#6a6a62;">银河摄影分析</div>
      <div style="font-size:12px;font-weight:300;line-height:1.9;color:#6a6a62;">
        <div>评分：${galaxyScore.score}</div>
        <div>${galaxyScore.details}</div>
        <div>月相：${galaxyScore.moonPhase}</div>
        <div>黄昏结束：${galaxyScore.sunsetTime}</div>
      </div>
    </div>
    ` : `
    <div style="background:#f0efea;padding:16px;margin:16px 0;">
      <div style="font-size:12px;color:#b8b7b0;font-weight:300;">选择出行日期查看银河摄影评分</div>
    </div>
    `}

    <div style="margin:12px 0;display:flex;gap:20px;">
      <div>
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">无人机</div>
        <div style="font-size:13px;font-weight:300;">${island.可带无人机 ? '允许携带' : '不允许'}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:4px;">餐饮计划</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${island.餐饮计划.map(m => `<span style="border:1px solid #e8e7e2;padding:2px 8px;font-size:11px;font-weight:300;">${m === 'BB' ? '含早' : m === 'HB' ? '早晚餐' : '全包'}</span>`).join('')}
        </div>
      </div>
    </div>

    <div style="margin:12px 0;">
      <div style="font-size:10px;color:#b8b7b0;letter-spacing:0.1em;margin-bottom:6px;">特色活动</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        ${island.特色活动.map(a => `<span style="border:1px solid #e8e7e2;padding:2px 8px;font-size:11px;font-weight:300;">${a}</span>`).join('')}
      </div>
    </div>

    <p style="font-size:13px;font-weight:300;color:#8a8a80;line-height:1.7;margin:16px 0;padding-top:16px;border-top:1px solid #e8e7e2;">${island.简介}</p>

    <div style="font-size:10px;color:#c8c7c0;text-align:center;padding-top:12px;border-top:1px solid #e8e7e2;">
      ${island.数据来源} · 更新于 ${island.数据更新}
    </div>
  `;

  modal.classList.add('open');
}

function closeDetail() {
  document.getElementById('detailModal').classList.remove('open');
}

// ===== 事件绑定 =====
function setupEventListeners() {
  // 星级
  document.querySelectorAll('[data-filter="star"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      filters.starRatings = Array.from(document.querySelectorAll('[data-filter="star"].active')).map(e => e.dataset.value);
      reRender();
    });
  });

  // 浮潜
  document.querySelectorAll('[data-filter="snorkel"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      filters.snorkelGrades = Array.from(document.querySelectorAll('[data-filter="snorkel"].active')).map(e => e.dataset.value);
      reRender();
    });
  });

  // 沙滩
  document.querySelectorAll('[data-filter="beach"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      filters.beachGrades = Array.from(document.querySelectorAll('[data-filter="beach"].active')).map(e => e.dataset.value);
      reRender();
    });
  });

  // 上岛方式
  document.querySelectorAll('[data-filter="transfer"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      filters.transfers = Array.from(document.querySelectorAll('[data-filter="transfer"].active')).map(e => e.dataset.value);
      reRender();
    });
  });

  // 适合人群
  document.querySelectorAll('[data-filter="crowd"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      filters.crowds = Array.from(document.querySelectorAll('[data-filter="crowd"].active')).map(e => e.dataset.value);
      reRender();
    });
  });

  // 餐饮
  document.querySelectorAll('[data-filter="meal"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      filters.meals = Array.from(document.querySelectorAll('[data-filter="meal"].active')).map(e => e.dataset.value);
      reRender();
    });
  });

  // 预算
  document.getElementById('priceMin').addEventListener('input', e => {
    filters.priceMin = e.target.value;
    reRender();
  });
  document.getElementById('priceMax').addEventListener('input', e => {
    filters.priceMax = e.target.value;
    reRender();
  });

  // 日期
  document.getElementById('dateInput').addEventListener('change', e => {
    filters.date = e.target.value;
    reRender();
    updateGalaxyPreview();
  });

  // 银河复选框
  document.getElementById('galaxyOnly').addEventListener('change', e => {
    filters.galaxyOnly = e.target.checked;
    document.getElementById('galaxyCheck').classList.toggle('active');
    reRender();
  });

  // 无人机复选框
  document.getElementById('droneOnly').addEventListener('change', e => {
    filters.droneOnly = e.target.checked;
    document.getElementById('droneCheck').classList.toggle('active');
    reRender();
  });

  // 快捷标签
  document.querySelectorAll('[data-quick]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.quick;
      if (filters.quickTag === tag) {
        filters.quickTag = '';
        el.classList.remove('active');
      } else {
        document.querySelectorAll('[data-quick]').forEach(t => t.classList.remove('active'));
        filters.quickTag = tag;
        el.classList.add('active');
      }
      reRender();
    });
  });

  // 重置
  document.getElementById('resetBtn').addEventListener('click', resetFilters);

  // 点击遮罩关闭模态框
  document.getElementById('detailModal').addEventListener('click', e => {
    if (e.target === document.getElementById('detailModal')) closeDetail();
  });

  // ESC 关闭模态框
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetail();
  });
}

function updateGalaxyPreview() {
  const preview = document.getElementById('galaxyPreview');
  if (!filters.date) {
    preview.innerHTML = '选择出行日期查看银河拍摄条件';
    preview.className = 'galaxy-preview';
    return;
  }

  const results = islandsData.map(island => {
    if (!island.摄影数据) return null;
    return window.Astro.galaxyPhotographyScore({
      date: new Date(filters.date),
      lat: island.摄影数据.纬度,
      bortle: island.摄影数据.光污染等级,
      lightControl: island.摄影数据.岛上灯光控制
    });
  }).filter(Boolean);

  const good = results.filter(r => r.good).length;
  const total = results.length;
  const pct = Math.round(good / total * 100);

  const date = new Date(filters.date);
  const jd = window.Astro.julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const age = window.Astro.moonAge(jd);
  const moonPhase = window.Astro.moonPhaseName(age);
  const moonRating = window.Astro.moonPhaseRating(age);

  let cls = 'galaxy-preview';
  if (pct >= 70) cls += ' good';
  else if (pct >= 40) cls += ' ok';
  else cls += ' bad';

  preview.innerHTML = `
    <div style="margin-bottom:4px;">${moonPhase} · 可见率 ${pct}%</div>
    <div>${good}/${total} 个岛屿适合拍摄</div>
    <div class="galaxy-detail">月相评分：${moonRating.score}</div>
  `;
  preview.className = cls;
}

function reRender() {
  const filtered = applyFilters();
  renderIslands(filtered);
  updateMatchCount();
}

function resetFilters() {
  filters = {
    priceMin: '', priceMax: '', date: '', starRatings: [], snorkelGrades: [],
    beachGrades: [], transfers: [], crowds: [], meals: [],
    galaxyOnly: false, droneOnly: false, quickTag: ''
  };

  document.querySelectorAll('.tag.active').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[data-quick].active').forEach(t => t.classList.remove('active'));
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('dateInput').value = '';
  document.getElementById('galaxyOnly').checked = false;
  document.getElementById('galaxyCheck').classList.remove('active');
  document.getElementById('droneOnly').checked = false;
  document.getElementById('droneCheck').classList.remove('active');
  document.getElementById('galaxyPreview').innerHTML = '选择出行日期查看银河拍摄条件';
  document.getElementById('galaxyPreview').className = 'galaxy-preview';

  reRender();
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', init);
