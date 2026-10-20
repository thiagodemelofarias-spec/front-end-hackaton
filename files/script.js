// ===== Utilitários =====
const $ = (s, el = document) => el.querySelector(s);
const KEY = 'atividades:v1';

// Sanitização: remove tags/caracteres de controle e normaliza espaços.
// A renderização também usa textContent (nunca innerHTML com dados do usuário).
const sanitize = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => iso.split('-').reverse().join('/');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ===== Estado + persistência (RF08) =====
const store = {
  load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  },
  save(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); return true; }
    catch { toast('Não foi possível salvar no navegador.', true); return false; }
  },
};

let items = store.load();
let filter = 'todas';
let pendingDeleteId = null;

// ===== Feedback visual =====
let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
}

// ===== Validação (RF01) =====
const rules = {
  titulo: (v) => (v.length < 3 ? 'Informe um título com ao menos 3 caracteres.' : ''),
  disciplina: (v) => (!v ? 'Informe a disciplina.' : ''),
  descricao: (v) => (!v ? 'Descreva a atividade.' : ''),
  prazo: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return 'Escolha uma data válida.';
    return '';
  },
};
const fields = Object.keys(rules);

function setError(name, msg) {
  $(`[data-for="${name}"]`).textContent = msg;
  $('#' + name).classList.toggle('invalid', !!msg);
  $('#' + name).setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function readForm() {
  return Object.fromEntries(fields.map((f) => [f, sanitize($('#' + f).value)]));
}

function validate(data) {
  let first = null;
  fields.forEach((f) => {
    const msg = rules[f](data[f]);
    setError(f, msg);
    if (msg && !first) first = f;
  });
  if (first) $('#' + first).focus();
  return !first;
}

// ===== Formulário: criar e editar (RF01, RF03) =====
const form = $('#form');

function resetForm() {
  form.reset();
  $('#id').value = '';
  fields.forEach((f) => setError(f, ''));
  $('#formTitle').textContent = 'Nova atividade';
  $('#submitBtn').textContent = 'Adicionar atividade';
  $('#cancelBtn').hidden = true;
}

function startEdit(id) {
  const a = items.find((i) => i.id === id);
  if (!a) return;
  $('#id').value = a.id;
  fields.forEach((f) => { $('#' + f).value = a[f]; setError(f, ''); });
  $('#formTitle').textContent = 'Editar atividade';
  $('#submitBtn').textContent = 'Salvar alterações';
  $('#cancelBtn').hidden = false;
  $('#titulo').focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = readForm();
  if (!validate(data)) return toast('Corrija os campos destacados.', true);

  const id = $('#id').value;
  if (id) {
    items = items.map((i) => (i.id === id ? { ...i, ...data } : i));
    if (store.save(items)) toast('Atividade atualizada.');
  } else {
    items.unshift({ id: uid(), ...data, concluida: false, criadaEm: Date.now() });
    if (store.save(items)) toast('Atividade adicionada.');
  }
  resetForm();
  render();
});

$('#cancelBtn').addEventListener('click', () => { resetForm(); toast('Edição cancelada.'); });
fields.forEach((f) => $('#' + f).addEventListener('input', () => setError(f, '')));

// ===== Renderização (RF02, RF05, RF06, RF07) =====
function deadlineTag(a) {
  if (a.concluida) return el('span', 'tag ok', 'Concluída');
  const diff = Math.round((Date.parse(a.prazo) - Date.parse(today())) / 864e5);
  if (diff < 0) return el('span', 'tag late', `Atrasada há ${-diff} dia${diff === -1 ? '' : 's'}`);
  if (diff === 0) return el('span', 'tag soon', 'Vence hoje');
  if (diff <= 3) return el('span', 'tag soon', `Vence em ${diff} dia${diff === 1 ? '' : 's'}`);
  return null;
}

function card(a) {
  const li = el('li', 'item' + (a.concluida ? ' done' : '') + (!a.concluida && a.prazo < today() ? ' late' : ''));
  li.dataset.id = a.id;

  const check = el('button', 'check', '✓');
  check.dataset.act = 'toggle';
  check.setAttribute('aria-label', a.concluida ? 'Marcar como pendente' : 'Marcar como concluída');
  check.setAttribute('aria-pressed', String(a.concluida));

  const body = el('div');
  body.append(el('h3', '', a.titulo), el('p', '', a.descricao));
  const meta = el('div', 'meta');
  meta.append(el('span', 'tag', a.disciplina), el('span', 'tag date', 'Prazo: ' + fmtDate(a.prazo)));
  const dl = deadlineTag(a);
  if (dl) meta.append(dl);
  body.append(meta);

  const actions = el('div', 'actions');
  const edit = el('button', 'icon', 'Editar');
  edit.dataset.act = 'edit';
  const del = el('button', 'icon del', 'Excluir');
  del.dataset.act = 'delete';
  actions.append(edit, del);

  li.append(check, body, actions);
  return li;
}

function render() {
  const total = items.length;
  const done = items.filter((i) => i.concluida).length;
  $('#cTotal').textContent = total;
  $('#cDone').textContent = done;
  $('#cPend').textContent = total - done;

  const visible = items.filter((i) =>
    filter === 'todas' ? true : filter === 'concluidas' ? i.concluida : !i.concluida);

  const list = $('#list');
  list.replaceChildren(...visible.map(card));

  const empty = $('#empty');
  empty.hidden = visible.length > 0;
  empty.textContent = total === 0
    ? 'Nenhuma atividade ainda. Preencha o formulário para adicionar a primeira.'
    : 'Nenhuma atividade neste filtro.';
}

// ===== Ações da lista (delegação de eventos) =====
$('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.item').dataset.id;
  const a = items.find((i) => i.id === id);
  if (!a) return;

  if (btn.dataset.act === 'toggle') {
    a.concluida = !a.concluida;
    if (store.save(items)) toast(a.concluida ? 'Atividade concluída.' : 'Atividade reaberta.');
    render();
  } else if (btn.dataset.act === 'edit') {
    startEdit(id);
  } else if (btn.dataset.act === 'delete') {
    pendingDeleteId = id;
    $('#confirmText').textContent = `"${a.titulo}" será removida permanentemente.`;
    $('#confirm').showModal();
  }
});

// ===== Exclusão com confirmação (RF04) =====
$('#confirm').addEventListener('close', (e) => {
  if (e.target.returnValue === 'ok' && pendingDeleteId) {
    items = items.filter((i) => i.id !== pendingDeleteId);
    if (store.save(items)) toast('Atividade excluída.');
    if ($('#id').value === pendingDeleteId) resetForm();
    render();
  }
  pendingDeleteId = null;
  e.target.returnValue = '';
});

// ===== Filtros (RF06) =====
document.querySelector('.filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  filter = chip.dataset.filter;
  document.querySelectorAll('.chip').forEach((c) => {
    const on = c === chip;
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', String(on));
  });
  render();
});

render();
