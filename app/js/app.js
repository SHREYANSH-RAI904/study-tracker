// Configure IndexedDB via localForage
localforage.config({ driver: localforage.INDEXEDDB, name: 'trackerDB' });

// CONSTANTS
const TRACK_START = '2025-07-03';
const QUOTES = [
  "Don’t watch the clock; do what it does. Keep going.",
  "Success is the sum of small efforts repeated day in and day out.",
  "It always seems impossible until it’s done.",
  "Motivation gets you going, habit keeps you going."
];

// STORAGE HELPERS
async function loadTasks() {
  const v = await localforage.getItem('tasks');
  return v || [];
}
function saveTasks(t) {
  return localforage.setItem('tasks', t);
}
async function loadHours() {
  const v = await localforage.getItem('studyHours');
  return v || {};
}
function saveHours(h) {
  return localforage.setItem('studyHours', h);
}
async function loadDailyTarget() {
  const key = 'dailyTarget-' + targetDateKey();
  const v = await localforage.getItem(key);
  return v || '';
}
function saveDailyTarget(txt) {
  const key = 'dailyTarget-' + targetDateKey();
  return localforage.setItem(key, txt);
}
async function loadFlag(k) {
  const v = await localforage.getItem(k);
  return v || null;
}
function setFlag(k) {
  return localforage.setItem(k, '1');
}

// UTILITIES
function targetDateKey() {
  const now = new Date();
  if (now.getHours() >= 20) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return t.toISOString().slice(0,10);
  }
  return now.toISOString().slice(0,10);
}

async function resetMonthlyFlags() {
  const ym = new Date().toISOString().slice(0,7);
  const keys = await localforage.keys();
  for (let k of keys) {
    if (k.startsWith('motivated-') && k !== 'motivated-'+ym) {
      await localforage.removeItem(k);
    }
  }
}

async function clearTasksAtNoon() {
  const now = new Date();
  const dateKey = now.toISOString().slice(0,10);
  const flag = 'tasksCleared-' + dateKey;
  if (now.getHours() >= 12 && !(await loadFlag(flag))) {
    await saveTasks([]);
    await renderTasks();
    updateChart();
    renderCalendar();
    setFlag(flag);
  }
}

function scheduleMidnightReload() {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(), now.getMonth(), now.getDate()+1
  );
  setTimeout(() => location.reload(), tomorrow - now + 1000);
}

// RENDERERS & UPDATERS
async function renderDailyTarget() {
  const txt = await loadDailyTarget();
  document.getElementById('dailyTargetDisplay').textContent =
    txt ? `Today’s Target: ${txt}` : '';
}

async function renderTasks() {
  const arr = await loadTasks();
  const ul = document.getElementById('tasks');
  ul.innerHTML = '';
  arr.forEach((t,i) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center'
                 + (t.completed ? ' completed' : '');
    li.innerHTML = `
      <span>${t.description}</span>
      <button class="btn btn-sm btn-success complete-btn" data-i="${i}">✓</button>
    `;
    ul.append(li);
  });
  document.querySelectorAll('.complete-btn').forEach(btn => {
    btn.onclick = async () => {
      const i = +btn.dataset.i;
      const tasks = await loadTasks();
      if (!tasks[i].completed) {
        tasks[i].completed = true;
        tasks[i].dateCompleted = new Date().toISOString();
        await saveTasks(tasks);
        showQuote();
        updateChart();
        renderCalendar();
        renderTasks();
      }
    };
  });
}

function showQuote() {
  const q = document.getElementById('quote');
  q.textContent = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  setTimeout(() => q.textContent = '', 4000);
}

async function updateAverages() {
  const hrs = await loadHours();
  const today = new Date();
  // Weekly
  const sd = today.getDay();
  const sunday = new Date(today - sd * 86400000);
  let sum7=0, c7=0;
  for (let i=0; i<7; i++) {
    const d = new Date(sunday.getTime()+i*86400000)
      .toISOString().slice(0,10);
    if (hrs[d] != null) { sum7 += hrs[d]; c7++; }
  }
  document.getElementById('weeklyAvg').textContent =
    c7 ? (sum7/c7).toFixed(2) : '0';

  // Monthly (Aug onward)
  const isAug = today >= new Date('2025-08-01');
  const ym = today.toISOString().slice(0,7);
  let sumM=0, cM=0;
  for (let [k,v] of Object.entries(hrs)) {
    if (k.startsWith(ym)) { sumM+=v; cM++; }
  }
  const row = document.getElementById('monthlyAvgRow');
  if (isAug) {
    row.style.display = 'block';
    document.getElementById('monthlyAvg').textContent =
      cM ? (sumM/cM).toFixed(2) : '0';
  } else row.style.display = 'none';
}

// Pie chart
let pieChart;
async function updateChart() {
  const now = new Date(), isAug = now >= new Date('2025-08-01');
  const ym = now.toISOString().slice(0,7);
  document.getElementById('chartContainer').style.display =
    isAug ? 'block' : 'none';
  if (!isAug) return;

  const arr = (await loadTasks())
    .filter(t => t.dateAdded.slice(0,7)===ym);
  const done = arr.filter(t=>t.completed && t.dateCompleted.slice(0,7)===ym).length;
  const data = {
    labels:['Completed','Remaining'],
    datasets:[{
      data:[done, Math.max(0,arr.length-done)],
      backgroundColor:['#198754','#6c757d']
    }]
  };
  if (!pieChart) {
    pieChart = new Chart(
      document.getElementById('pieChart'),
      { type:'pie', data, options:{ plugins:{ legend:{ position:'bottom' } } } }
    );
  } else {
    pieChart.data = data;
    pieChart.update();
  }

  const flag = 'motivated-'+ym;
  if (arr.length && done/arr.length >= 0.8 && !(await loadFlag(flag))) {
    alert("🎉 You've hit 80% of your monthly goals! 🎉");
    setFlag(flag);
  }
}

// Calendar
let calendar;
async function renderCalendar() {
  const evs = [];
  const tasks = await loadTasks();
  tasks.forEach(t => {
    if (t.completed) evs.push({
      title:`✔ ${t.description}`,
      start:t.dateCompleted.slice(0,10),
      color:'#198754'
    });
  });
  const hrs = await loadHours();
  for (let [d,h] of Object.entries(hrs)) {
    evs.push({ title:`${h}h studied`, start:d, color:'#0d6efd' });
  }

  if (calendar) {
    calendar.removeAllEvents();
    calendar.addEventSource(evs);
  } else {
    calendar = new FullCalendar.Calendar(
      document.getElementById('calendar'),
      {
        initialView:'dayGridMonth',
        initialDate:TRACK_START,
        height:550,
        events:evs
      }
    );
    calendar.render();
  }
}

// Event listeners & binding
document.getElementById('addTaskBtn').onclick = async () => {
  const txt = document.getElementById('newTask').value.trim();
  if (!txt) return;
  const tasks = await loadTasks();
  tasks.push({
    description:txt,
    completed:false,
    dateAdded:new Date().toISOString(),
    dateCompleted:null
  });
  document.getElementById('newTask').value = '';
  await saveTasks(tasks);
  renderTasks();
  updateChart();
  renderCalendar();
};

document.getElementById('saveHoursBtn').onclick = async () => {
  const h = parseFloat(document.getElementById('hoursInput').value);
  if (isNaN(h)||h<0) return;
  const day = new Date().toISOString().slice(0,10);
  const hrs = await loadHours();
  hrs[day] = h;
  await saveHours(hrs);
  document.getElementById('hoursInput').value = '';
  updateAverages();
  renderCalendar();
};

document.getElementById('saveDailyBtn').onclick = async () => {
  const txt = document.getElementById('dailyTargetInput').value.trim();
  if (!txt) return;
  await saveDailyTarget(txt);
  renderDailyTarget();
};

document.getElementById('showSummaryBtn').onclick = async () => {
  const m = document.getElementById('monthPicker').value;
  if (!m) return;
  const tasks = (await loadTasks()).filter(t=>t.dateAdded.startsWith(m));
  const done = tasks.filter(t=>t.completed && t.dateCompleted.startsWith(m)).length;
  const pct = tasks.length ? ((done/tasks.length)*100).toFixed(1) : '0.0';
  const hrs = await loadHours();
  let sum=0,c=0;
  for (let [k,v] of Object.entries(hrs)) {
    if (k.startsWith(m)) { sum+=v; c++; }
  }
  const avg = c ? (sum/c).toFixed(2) : '0.00';
  document.getElementById('monthlySummary').innerHTML = `
    <p><strong>${m}</strong></p>
    <p>✅ Completion Rate: <strong>${pct}%</strong></p>
    <p>⏱ Avg Study Hours: <strong>${avg} hrs/day</strong></p>
  `;
};

document.getElementById('exportBtn').onclick = async () => {
  const data = { tasks: await loadTasks(), studyHours: await loadHours() };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'tracker-backup.json'; a.click();
  URL.revokeObjectURL(url);
};

document.getElementById('importBtn').onclick = () =>
  document.getElementById('importFile').click();

document.getElementById('importFile').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const obj = JSON.parse(reader.result);
      if (obj.tasks) await saveTasks(obj.tasks);
      if (obj.studyHours) await saveHours(obj.studyHours);
      await renderDailyTarget();
      await renderTasks();
      updateAverages();
      updateChart();
      renderCalendar();
      alert('✅ Data imported successfully!');
    } catch {
      alert('❌ Invalid backup file.');
    }
  };
  reader.readAsText(file);
};

document.getElementById('resetAllBtn').onclick = () => {
  if (!confirm('This will clear ALL data. Continue?')) return;
  localforage.clear().then(() => location.reload());
};

// INITIAL LOAD
(async function(){
  await resetMonthlyFlags();
  await renderDailyTarget();
  await renderTasks();
  updateAverages();
  updateChart();
  renderCalendar();
  clearTasksAtNoon();
  setInterval(clearTasksAtNoon, 5*60*1000);
  scheduleMidnightReload();
})();
