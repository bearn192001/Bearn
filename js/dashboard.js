import { init, money, client } from '/js/core.js';

const number = value => Number(value || 0);
const countFormat = value => number(value).toLocaleString('id-ID');
const compactMoney = value => money(number(value));
const byId = id => document.getElementById(id);

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = value;
}

function setTrend(id, current, previous) {
  const node = byId(id);
  if (!node) return;
  current = number(current);
  previous = number(previous);
  node.classList.remove('up', 'down', 'flat');
  let label;
  let direction;
  if (previous === 0 && current > 0) {
    label = '↑ Baru'; direction = 'up';
  } else if (previous === 0 && current === 0) {
    label = '— 0%'; direction = 'flat';
  } else {
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const rounded = Math.abs(change) >= 100 ? Math.round(change) : Math.round(change * 10) / 10;
    direction = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
    label = `${change > 0.05 ? '↑' : change < -0.05 ? '↓' : '—'} ${Math.abs(rounded).toLocaleString('id-ID')}%`;
  }
  node.textContent = label;
  node.classList.add(direction);
  node.setAttribute('aria-label', `${direction === 'up' ? 'Naik' : direction === 'down' ? 'Turun' : 'Stabil'} dibanding tujuh hari sebelumnya`);
}

function chartValue(value, type) {
  if (type === 'revenue') return compactMoney(value);
  return countFormat(value);
}

function shortDay(day) {
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(day || '') : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(date);
}

function drawChart(containerId, rows, key, type, color) {
  const host = byId(containerId);
  if (!host) return;
  const values = (Array.isArray(rows) ? rows : []).map(row => number(row?.[key]));
  const labels = (Array.isArray(rows) ? rows : []).map(row => shortDay(row?.day));
  const total = values.reduce((sum, value) => sum + value, 0);
  const totalNode = byId(containerId === 'autoTrendChart' ? 'autoChartTotal' : 'paymentChartTotal');
  const captionNode = byId(containerId === 'autoTrendChart' ? 'autoChartCaption' : 'paymentChartCaption');
  if (totalNode) totalNode.textContent = chartValue(total, type);
  if (captionNode) captionNode.textContent = type === 'revenue'
    ? 'Total penghasilan bersih selama 7 hari'
    : type === 'views' ? 'Total view valid selama 7 hari' : 'Total transaksi sukses selama 7 hari';

  if (!values.length) {
    host.innerHTML = '<div class="chart-empty">Belum ada data tren untuk ditampilkan.</div>';
    return;
  }

  const width = 760, height = 210, left = 62, right = 18, top = 14, bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(...values, 1);
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;
  const x = index => values.length > 1 ? left + step * index : left + plotWidth / 2;
  const y = value => top + plotHeight - (value / maxValue) * plotHeight;
  const points = values.map((value, index) => [x(index), y(value)]);
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${points.at(-1)[0].toFixed(2)} ${(top + plotHeight).toFixed(2)} L ${points[0][0].toFixed(2)} ${(top + plotHeight).toFixed(2)} Z`;
  const grid = [0, 1, 2, 3].map(index => {
    const ratio = index / 3;
    const gy = top + plotHeight - plotHeight * ratio;
    const value = maxValue * ratio;
    return `<line class="chart-grid-line" x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}"/><text class="chart-axis-label" x="${left-9}" y="${gy+3}" text-anchor="end">${type === 'revenue' ? (value >= 1000000 ? `Rp${(value/1000000).toFixed(1)}jt` : value >= 1000 ? `Rp${Math.round(value/1000)}k` : `Rp${Math.round(value)}`) : countFormat(Math.round(value))}</text>`;
  }).join('');
  const xLabels = labels.map((label, index) => `<text class="chart-axis-label" x="${x(index)}" y="${height-8}" text-anchor="middle">${label}</text>`).join('');
  const markers = points.map((point, index) => `<circle class="chart-point" cx="${point[0]}" cy="${point[1]}" r="4"><title>${labels[index]}: ${chartValue(values[index], type)}</title></circle>`).join('');
  const gradientId = `${containerId}Fill`;
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik ${type} tujuh hari"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".21"/><stop offset="100%" stop-color="${color}" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${areaPath}" fill="url(#${gradientId})"/><path class="chart-line" d="${linePath}" style="--chart-color:${color}"/>${markers}${xLabels}</svg>`;
}

let autoRows = [];
let paymentRows = [];
let autoMetric = 'views';
let paymentMetric = 'sales';

function updateCharts() {
  const autoType = autoMetric === 'revenue' ? 'revenue' : autoMetric === 'views' ? 'views' : 'sales';
  drawChart('autoTrendChart', autoRows, autoMetric, autoType, autoMetric === 'revenue' ? '#179a70' : autoMetric === 'sales' ? '#c58b2d' : '#5978e8');
  const paymentType = paymentMetric === 'revenue' ? 'revenue' : 'sales';
  drawChart('paymentTrendChart', paymentRows, paymentMetric, paymentType, paymentMetric === 'revenue' ? '#15966b' : '#8061d8');
}

function bindChartTabs() {
  document.querySelectorAll('[data-chart-group][data-chart-key]').forEach(button => {
    button.addEventListener('click', () => {
      const group = button.dataset.chartGroup;
      const key = button.dataset.chartKey;
      document.querySelectorAll(`[data-chart-group="${group}"]`).forEach(item => item.classList.toggle('is-active', item === button));
      if (group === 'auto') autoMetric = key;
      if (group === 'payment') paymentMetric = key;
      updateCharts();
    });
  });
}

function renderMetrics(data) {
  const autoRevenue = number(data.auto_link_revenue) + number(data.auto_link_view_revenue);
  setText('autoLinkCount', countFormat(data.auto_link_count));
  setText('autoLinkViewCount', countFormat(data.auto_link_view_count));
  setText('autoLinkPaidCount', countFormat(data.auto_link_paid_count));
  setText('autoLinkTotalRevenue', compactMoney(data.auto_link_total_revenue ?? autoRevenue));
  setText('paymentLinkPaidCount', countFormat(data.payment_link_paid_count));
  setText('paymentLinkRevenue', compactMoney(data.payment_link_revenue));

  setTrend('autoLinkCountTrend', data.auto_link_new_7d, data.auto_link_new_prev_7d);
  setTrend('autoLinkViewsTrend', data.auto_link_views_7d, data.auto_link_views_prev_7d);
  setTrend('autoLinkSalesTrend', data.auto_link_sales_7d, data.auto_link_sales_prev_7d);
  setTrend('autoLinkRevenueTrend', data.auto_link_revenue_7d, data.auto_link_revenue_prev_7d);
  setTrend('paymentLinkSalesTrend', data.payment_link_sales_7d, data.payment_link_sales_prev_7d);
  setTrend('paymentLinkRevenueTrend', data.payment_link_revenue_7d, data.payment_link_revenue_prev_7d);

  autoRows = Array.isArray(data.auto_link_daily) ? data.auto_link_daily : [];
  paymentRows = Array.isArray(data.payment_link_daily) ? data.payment_link_daily : [];
  updateCharts();
  setText('lastUpdated', `Diperbarui ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`);
}

document.addEventListener('DOMContentLoaded', async () => {
  bindChartTabs();
  await init();
  if (!client) {
    setText('lastUpdated', 'Database belum terhubung');
    updateCharts();
    return;
  }
  const { data, error } = await client.rpc('get_dashboard_metrics');
  if (error) {
    console.warn('[BEARN dashboard]', error.message);
    setText('lastUpdated', 'Gagal memuat statistik');
    const host = byId('autoTrendChart');
    if (host) host.innerHTML = '<div class="chart-empty">Statistik belum tersedia. Pastikan migrasi SQL dashboard sudah dijalankan.</div>';
    return;
  }
  renderMetrics(data || {});
});
