const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TIMES = ['Morning','Afternoon','Night'];
const PALETTE = ['#3D2B1F','#634832','#89674C','#D4A373','#E9EDC9','#A68A64','#582F0E'];
const ACCENT = '#D97706';
const SOFT_BROWN = '#967259';
const COLUMNS = ['hour_of_day','cash_type','money','coffee_name','Time_of_Day','Weekday','Month_name','Weekdaysort','Monthsort','Date','Time'];
const MENUS = ['Dashboard Overview','Tren Bulanan','Produk Terlaris'];

let data = [];
let activeProduct = 'Semua';
let activeMenu = 'Dashboard Overview';

const el = (id) => document.getElementById(id);

async function boot() {
  try {
    const response = await fetch('data/coffee.json');
    data = await response.json();
    setupUI();
    render();
  } catch (error) {
    document.querySelector('.main').insertAdjacentHTML('afterbegin', '<p>Data tidak ditemukan.</p>');
  }
}

function setupUI() {
  const select = el('productFilter');
  const products = [...new Set(data.map((row) => row.coffee_name))].sort();
  ['Semua', ...products].forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  select.addEventListener('change', (event) => {
    activeProduct = event.target.value;
    render();
  });

  const nav = el('nav');
  MENUS.forEach((menu) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = menu;
    button.dataset.menu = menu;
    button.addEventListener('click', () => {
      activeMenu = menu;
      render();
    });
    nav.appendChild(button);
  });

  el('downloadBtn').addEventListener('click', downloadCSV);
}

function filteredRows() {
  return activeProduct === 'Semua' ? data : data.filter((row) => row.coffee_name === activeProduct);
}

function formatMoney(value) {
  return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function groupSum(rows, key, order) {
  const map = new Map(order.map((item) => [item, 0]));
  rows.forEach((row) => map.set(row[key], (map.get(row[key]) || 0) + Number(row.money || 0)));
  return Array.from(map, ([name, value]) => ({ name, value }));
}

function countBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => map.set(row[key], (map.get(row[key]) || 0) + 1));
  return Array.from(map, ([name, count]) => ({ name, count }));
}

function chartLayout(extra) {
  return Object.assign({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#FFFFFF' },
    margin: { l: 10, r: 10, t: 30, b: 10 },
    showlegend: false
  }, extra || {});
}

function draw(id, traces, layout) {
  Plotly.react(id, traces, chartLayout(layout), { responsive: true, displayModeBar: false });
}

function drawMonthly(id, rows, height) {
  const stats = groupSum(rows, 'Month_name', MONTHS);
  const x = stats.map((item) => item.name);
  const y = stats.map((item) => item.value);
  draw(id, [
    {
      type: 'bar', name: 'Revenue', x, y,
      marker: { color: SOFT_BROWN },
      text: y.map((value) => value.toFixed(0)),
      textposition: 'inside', insidetextanchor: 'middle'
    },
    {
      type: 'scatter', name: 'Trend', x, y,
      mode: 'lines+markers',
      line: { color: ACCENT, width: 4, shape: 'spline' }
    }
  ], { height });
}

function drawProducts(id, rows, limit, height) {
  const best = countBy(rows, 'coffee_name').sort((a, b) => b.count - a.count).slice(0, limit).reverse();
  draw(id, [{
    type: 'bar', orientation: 'h',
    x: best.map((item) => item.count),
    y: best.map((item) => item.name),
    marker: {
      color: best.map((item) => item.count),
      colorscale: [[0, '#4E342E'], [1, ACCENT]],
      showscale: false
    }
  }], { height, margin: { l: 10, r: 10, t: 20, b: 10 } });
}

function drawTimeCoffee(id, rows) {
  const coffees = [...new Set(rows.map((row) => row.coffee_name))].sort();
  const traces = coffees.map((coffee, index) => ({
    type: 'bar', name: coffee, x: TIMES,
    y: TIMES.map((time) => rows.filter((row) => row.Time_of_Day === time && row.coffee_name === coffee).length),
    marker: { color: coffee === 'Latte' ? '#FFFFFF' : PALETTE[index % PALETTE.length] }
  }));
  draw(id, traces, {
    barmode: 'stack', showlegend: true,
    legend: { title: null, font: { size: 10 } },
    xaxis: { showgrid: false, title: 'Waktu' },
    yaxis: { showgrid: true, gridcolor: '#333333', title: 'Jumlah Gelas' }
  });
}

function drawWeekday(id, rows) {
  const stats = groupSum(rows, 'Weekday', DAYS);
  draw(id, [{
    type: 'scatter', mode: 'lines+markers',
    x: stats.map((item) => item.name),
    y: stats.map((item) => item.value),
    line: { color: ACCENT, width: 3 }
  }], {
    xaxis: { showgrid: false },
    yaxis: { showgrid: true, gridcolor: '#333333' }
  });
}

function drawHours(id, rows) {
  const map = new Map();
  rows.forEach((row) => {
    const hour = Number(row.hour_of_day);
    map.set(hour, (map.get(hour) || 0) + 1);
  });
  const hours = [...map.keys()].sort((a, b) => a - b);
  draw(id, [{
    type: 'scatter', mode: 'lines', fill: 'tozeroy',
    x: hours,
    y: hours.map((hour) => map.get(hour)),
    line: { color: ACCENT, width: 3 }
  }], { height: 350, xaxis: { showgrid: false }, yaxis: { showgrid: true, gridcolor: '#333333' } });
}

function renderKPIs(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.money || 0), 0);
  const paymentCounts = countBy(rows, 'cash_type').sort((a, b) => b.count - a.count);
  el('kpiRevenue').textContent = formatMoney(total);
  el('kpiCups').textContent = rows.length.toLocaleString('en-US') + ' Cup';
  el('kpiAverage').textContent = formatMoney(rows.length ? total / rows.length : 0);
  el('kpiPayment').textContent = paymentCounts.length ? paymentCounts[0].name.charAt(0).toUpperCase() + paymentCounts[0].name.slice(1) : 'N/A';
}

function renderTable(rows) {
  const columns = data.length ? COLUMNS.filter((column) => column in data[0]) : [];
  const table = el('dataTable');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  rows.slice(0, 50).forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const td = document.createElement('td');
      td.textContent = row[column];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.replaceChildren(thead, tbody);
}

function render() {
  const rows = filteredRows();
  el('pageTitle').textContent = activeMenu;
  document.querySelectorAll('#nav button').forEach((button) => {
    button.classList.toggle('active', button.dataset.menu === activeMenu);
  });

  el('view-overview').hidden = activeMenu !== 'Dashboard Overview';
  el('view-tren').hidden = activeMenu !== 'Tren Bulanan';
  el('view-produk').hidden = activeMenu !== 'Produk Terlaris';

  renderKPIs(rows);
  renderTable(rows);

  if (activeMenu === 'Tren Bulanan') {
    drawMonthly('chartMonthlyTrend', rows, 500);
  } else if (activeMenu === 'Produk Terlaris') {
    drawProducts('chartProductsTop', rows, 10, 600);
  } else {
    drawMonthly('chartMonthlyOverview', rows, 400);
    drawTimeCoffee('chartTimeCoffee', rows);
    drawWeekday('chartWeekday', rows);
    drawProducts('chartProductsOverview', rows, 8, 350);
    drawHours('chartHours', rows);
  }
}

function downloadCSV() {
  const rows = filteredRows();
  const columns = data.length ? COLUMNS.filter((column) => column in data[0]) : [];
  const escape = (value) => {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const lines = [columns.join(',')].concat(rows.map((row) => columns.map((column) => escape(row[column])).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'coffee_sales_' + activeProduct.toLowerCase().replace(/\s+/g, '_') + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

boot();
