const $ = (s) => document.querySelector(s);

// build table cells with textContent (never innerHTML) -> prevents XSS
function row(cells) {
  const tr = document.createElement('tr');
  cells.forEach((c) => {
    const td = document.createElement('td');
    if (c instanceof Node) td.appendChild(c); else td.textContent = c;
    tr.appendChild(td);
  });
  return tr;
}

async function loadInfo() {
  const info = await (await fetch('/api/info')).json();
  document.body.dataset.slot = info.slot;
  $('#badge').textContent = `v${info.version} · ${info.slot.toUpperCase()}`;
}

async function loadPatients() {
  const data = await (await fetch('/api/patients')).json();
  $('#count').textContent = `(${data.length})`;
  const body = $('#rows');
  body.replaceChildren();
  data.forEach((p) => {
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'del';
    del.onclick = async () => { await fetch('/api/patients/' + p.id, { method: 'DELETE' }); refresh(); };
    body.appendChild(row([p.id, p.name, p.age, p.gender, p.diagnosis, del]));
  });
}

async function loadAudit() {
  const data = await (await fetch('/api/audit')).json();
  const body = $('#audit');
  body.replaceChildren();
  data.forEach((a) => body.appendChild(row([a.action, a.detail || '', `${a.slot} v${a.version}`, new Date(a.at).toLocaleTimeString()])));
}

function refresh() { loadPatients(); loadAudit(); }

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = { name: f.name.value, age: f.age.value, gender: f.gender.value, diagnosis: f.diagnosis.value };
  const res = await fetch('/api/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const msg = $('#msg');
  if (res.ok) { msg.textContent = 'Patient saved.'; msg.className = 'msg ok'; f.reset(); refresh(); }
  else { const j = await res.json(); msg.textContent = (j.errors || [j.error]).join('; '); msg.className = 'msg err'; }
});

loadInfo();
refresh();
