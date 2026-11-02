/* Pedido para el salón — módulo compartido por todas las cartas (demo de front, sin backend).
   Cada plato se marca con data-pd (ver Pedido.attr); init() agrega el + / −, la barra "Ver pedido",
   la hoja "Mi pedido", el resumen para el mozo, el diálogo del plato y el buscador. */
(() => {
'use strict';

const fmt = n => '$ ' + n.toLocaleString('es-AR');
const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); };
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const T = {
  add: n => `Agregar ${n} al pedido`, less: n => `Quitar una unidad de ${n}`, more: n => `Agregar una unidad de ${n}`,
  pick: n => `Elegir opciones de ${n}`, view: 'Ver pedido', dine: 'Pedido para el salón', items: n => n === 1 ? '1 plato' : `${n} platos`,
  title: 'Mi pedido', hint: 'Revisá tu pedido y ajustá las cantidades. Después se lo mostrás al mozo.',
  empty: 'Todavía no agregaste nada. Tocá + en los platos que quieras.', total: 'Total estimado', make: 'Hacer pedido',
  show: 'Mostrale esta pantalla al mozo cuando se acerque a tu mesa.', done: 'Listo', edit: 'Modificar pedido',
  addOrder: 'Agregar al pedido', inOrder: 'En tu pedido', close: 'Cerrar', back: 'Volver', ask: 'Consultá el precio con el mozo.',
  search: '¿Qué tenés ganas de comer?', searchLabel: 'Buscar en la carta', none: 'No encontramos platos con esa búsqueda.',
};

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
};

// h('div', {class: 'x', onclick, html}, hijos...) — hijos: nodos o textos (los falsy se ignoran)
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
const icon = (name, cls) => h('span', {class: cls || null, html: ICON[name], 'aria-hidden': 'true', style: 'display:contents'});

// ---------- precios: [[etiqueta, precio]] a partir de los formatos que usan las cartas ----------
function variants(p, cols) {
  if (typeof p === 'number') return [['', p]];
  if (Array.isArray(p)) return p.flatMap((v, i) => typeof v === 'number' ? [[(cols?.[i]?.l ?? cols?.[i]) || '', v]] : []);
  if (p && typeof p === 'object') return Object.entries(p).filter(([, v]) => typeof v === 'number');
  return [];
}

// Atributo para el <li>/<tr> de cada plato: Pedido.attr(nombre, precio, {d: descripción, cols, img})
function attr(name, p, o = {}) {
  const data = {n: plain(String(name)), v: variants(p, o.cols)};
  if (o.d) data.d = plain(String(o.d));
  if (o.img) data.i = o.img;
  return ` data-pd="${escAttr(JSON.stringify(data))}"`;
}

// ---------- estado del pedido (queda guardado en el dispositivo) ----------
const store = {lines: {}, mode: 'none'}; // mode: none · chosen (eligió salón) · done (tocó "Listo")
const subs = new Set();
let KEY = 'pedido:' + location.pathname;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return;
    for (const [k, l] of Object.entries(raw.lines || {}))
      if (l && typeof l.n === 'string' && Number.isFinite(l.p) && Number.isInteger(l.q) && l.q > 0) store.lines[k] = l;
    store.mode = ['chosen', 'done'].includes(raw.mode) && Object.keys(store.lines).length ? raw.mode : 'none';
  } catch {}
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} }
function emit() { save(); subs.forEach(fn => fn()); }

const lineKey = (sec, n, label, p) => [sec, n, label || p].join('|');
const qtyOf = key => store.lines[key]?.q || 0;
function bump(info, [label, p], d) {
  const key = lineKey(info.sec, info.n, label, p), cur = store.lines[key];
  const q = (cur?.q || 0) + d;
  if (q <= 0) delete store.lines[key];
  else store.lines[key] = {n: info.n, s: info.sec, o: cur?.o ?? info.order, l: label, p, q};
  if (!Object.keys(store.lines).length) store.mode = 'none';
  emit();
}
const bumpLine = (key, d) => {
  const l = store.lines[key]; if (!l) return;
  l.q += d; if (l.q <= 0) delete store.lines[key];
  if (!Object.keys(store.lines).length) store.mode = 'none';
  emit();
};
const sorted = () => Object.entries(store.lines).sort(([, a], [, b]) => (a.o ?? 0) - (b.o ?? 0));
const count = () => Object.values(store.lines).reduce((s, l) => s + l.q, 0);
const total = () => Object.values(store.lines).reduce((s, l) => s + l.q * l.p, 0);

// ---------- ventanas ----------
let openModals = 0;
function modal(render, {label} = {}) {
  const prev = document.activeElement;
  const box = h('div', {class: 'pd-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || null});
  const ov = h('div', {class: 'pd-ov'}, box);
  const api = {
    close() {
      subs.delete(api.paint); ov.remove(); document.removeEventListener('keydown', onKey, true);
      if (!--openModals) document.body.classList.remove('pd-lock');
      prev?.focus?.();
    },
    paint() { const y = box.scrollTop; box.replaceChildren(render(api)); box.scrollTop = y; },
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll('button:not([disabled])')]; if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  ov.addEventListener('mousedown', e => { if (e.target === ov) api.close(); });
  document.addEventListener('keydown', onKey, true);
  api.paint(); subs.add(api.paint);
  document.body.append(ov); openModals++; document.body.classList.add('pd-lock');
  (box.querySelector('[data-first]') || box.querySelector('button'))?.focus();
  return api;
}

const stepper = (name, q, onLess, onMore) => h('span', {class: 'pd-ctl', role: 'group', 'aria-label': 'Cantidad: ' + name, style: 'margin:0'},
  h('button', {class: 'pd-b', type: 'button', 'aria-label': T.less(name), onclick: onLess, html: ICON.minus}),
  h('span', {class: 'pd-n', 'aria-live': 'polite'}, String(q)),
  h('button', {class: 'pd-b', type: 'button', 'aria-label': T.more(name), onclick: onMore, html: ICON.plus}));

const closeBtn = (m, cls) => h('button', {class: 'pd-x' + (cls ? ' ' + cls : ''), type: 'button', 'aria-label': T.close, onclick: m.close, html: ICON.x});

// líneas agrupadas por sección, en el orden de la carta
function groups() {
  const out = [];
  for (const [key, l] of sorted()) {
    let g = out.find(x => x.s === l.s);
    if (!g) out.push(g = {s: l.s, lines: []});
    g.lines.push([key, l]);
  }
  return out;
}
const lineName = l => l.l ? `${l.n} · ${l.l}` : l.n;

let view = 'list';
function openOrder() {
  view = store.mode === 'none' ? 'list' : 'dine';
  modal(m => {
    if (!count()) return h('div', {}, header(m, T.title, T.hint), h('p', {class: 'pd-empty'}, T.empty));
    return view === 'dine' ? dineView(m) : listView(m);
  }, {label: T.title});
}
function header(m, title, hint, back) {
  return h('div', {class: 'pd-hd'},
    h('div', {class: 'pd-tt'}, back && h('button', {class: 'pd-x', type: 'button', 'aria-label': T.back, onclick: back, html: ICON.back, style: 'margin-top:2px'}),
      h('div', {}, h('h2', {}, title), hint && h('p', {}, hint))),
    closeBtn(m));
}
function listView(m) {
  return h('div', {},
    header(m, T.title, T.hint),
    h('div', {class: 'pd-body'}, groups().map(g => h('section', {}, h('h3', {class: 'pd-eyebrow'}, g.s),
      g.lines.map(([key, l]) => h('div', {class: 'pd-ln'},
        h('div', {}, h('h4', {}, lineName(l)), h('small', {}, fmt(l.p * l.q))),
        stepper(lineName(l), l.q, () => bumpLine(key, -1), () => bumpLine(key, 1))))))),
    h('div', {class: 'pd-ft'},
      h('p', {class: 'pd-tot'}, h('span', {}, T.total), h('b', {}, fmt(total()))),
      h('button', {class: 'pd-main', type: 'button', 'data-first': true, onclick: () => { store.mode = 'chosen'; view = 'dine'; emit(); }}, T.make)));
}
function dineView(m) {
  const edit = () => { store.mode = 'none'; view = 'list'; emit(); };
  return h('div', {},
    header(m, T.dine, T.show, edit),
    h('div', {class: 'pd-body'}, groups().map(g => h('section', {}, h('h3', {class: 'pd-eyebrow'}, g.s),
      g.lines.map(([, l]) => h('div', {class: 'pd-ln'},
        h('h4', {}, h('span', {class: 'pd-q'}, l.q + '×'), lineName(l)),
        h('span', {class: 'pd-p'}, fmt(l.p * l.q))))))),
    h('div', {class: 'pd-ft'},
      h('p', {class: 'pd-tot'}, h('span', {}, T.total), h('b', {}, fmt(total()))),
      store.mode !== 'done' && h('button', {class: 'pd-main', type: 'button', 'data-first': true, onclick: () => { store.mode = 'done'; emit(); m.close(); }}, T.done),
      h('button', {class: 'pd-ghost', type: 'button', onclick: edit}, T.edit)));
}

// diálogo del plato: foto, descripción y cantidades
function openProduct(info) {
  modal(m => {
    const one = info.v.length === 1 ? info.v[0] : null;
    const q = one ? qtyOf(lineKey(info.sec, info.n, one[0], one[1])) : 0;
    const eyebrow = h('p', {class: 'pd-eyebrow'}, info.sec);
    let actions;
    if (one) actions = q === 0
      ? h('button', {class: 'pd-main', type: 'button', 'data-first': true, onclick: () => { bump(info, one, 1); m.close(); }}, T.addOrder)
      : [h('div', {class: 'pd-inyour'}, h('span', {class: 'pd-lbl'}, T.inOrder), stepper(info.n, q, () => bump(info, one, -1), () => bump(info, one, 1))),
         h('button', {class: 'pd-main', type: 'button', 'data-first': true, onclick: m.close}, T.done)];
    else if (info.v.length) actions = [
      h('ul', {class: 'pd-vars'}, info.v.map(v => h('li', {class: 'pd-ln'},
        h('div', {}, h('h4', {}, v[0] || info.n), h('small', {}, fmt(v[1]))),
        stepper(`${info.n} ${v[0]}`.trim(), qtyOf(lineKey(info.sec, info.n, v[0], v[1])), () => bump(info, v, -1), () => bump(info, v, 1))))),
      h('button', {class: 'pd-main', type: 'button', 'data-first': true, onclick: m.close}, T.done)];
    else actions = [h('p', {}, T.ask), h('button', {class: 'pd-main', type: 'button', 'data-first': true, onclick: m.close}, T.close)];
    return h('div', {},
      info.i && h('div', {class: 'pd-pic'}, h('img', {src: info.i, alt: ''}), closeBtn(m)),
      h('div', {class: 'pd-info', style: info.i ? null : 'position:relative;padding-right:62px'},
        !info.i && closeBtn(m, 'pd-flo'), eyebrow,
        h('div', {class: 'pd-top'}, h('h2', {}, info.n), one && h('span', {class: 'pd-price'}, fmt(one[1]))),
        info.d && h('p', {}, info.d), actions));
  }, {label: info.n});
}

// ---------- platos: + / − al lado del precio ----------
const items = [];
let sections = [];
function setupItem(el) {
  el.dataset.pdReady = '1';
  let data; try { data = JSON.parse(el.dataset.pd); } catch { return; }
  const secEl = el.closest('section'), secTitle = plain(secEl?.querySelector('h2')?.textContent || '');
  const info = {n: data.n, d: data.d, i: data.i, v: data.v, sec: secTitle || 'Carta', order: Math.max(0, sections.indexOf(secEl))};
  if (!info.v.length) return; // sin precio ("consultar"): solo abre el detalle
  // Si la carta ya muestra cada precio como tarjeta (data-pd-v="n"), cada tarjeta es el botón de esa variante.
  const chips = [...el.querySelectorAll('[data-pd-v]')];
  if (chips.length) {
    for (const c of chips) {
      const v = info.v[+c.dataset.pdV]; if (!v) continue;
      const cnt = h('span', {class: 'pd-cnt'}), name = `${info.n} ${v[0]}`.trim();
      c.classList.add('pd-chip'); c.setAttribute('role', 'button'); c.tabIndex = 0; c.append(cnt);
      const add = e => { e.stopPropagation(); bump(info, v, 1); };
      c.addEventListener('click', add);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(e); } });
      const paint = () => { const q = qtyOf(lineKey(info.sec, info.n, v[0], v[1])); cnt.textContent = q; cnt.hidden = !q; c.classList.toggle('pd-sel', !!q); c.setAttribute('aria-label', `${T.add(name)}${q ? ` (${q})` : ''}`); };
      subs.add(paint); paint();
    }
    return;
  }
  const ctl = h('span', {class: 'pd-ctl'});
  // El + va pegado al precio de la carta; data-pd-slot elige otro lugar y data-pd-block fuerza una fila propia.
  const prices = [...el.querySelectorAll('.pr, .v')];
  const own = el.hasAttribute('data-pd-block') || info.v.length > 2; // con 3+ precios no entra al lado
  const slot = el.querySelector('[data-pd-slot]') || (own ? null : prices[prices.length - 1]);
  if (slot) slot.append(ctl); else { ctl.classList.add('pd-block'); el.append(ctl); }
  // en una fila propia, si el plato no muestra su precio al lado, se lo agrega acá
  const lead = !slot && info.v.length === 1 && !el.hasAttribute('data-pd-nolabel') ? [h('span', {class: 'pd-pr'}, fmt(info.v[0][1]))] : [];
  const paint = () => {
    if (info.v.length > 1) {
      const n = info.v.reduce((s, v) => s + qtyOf(lineKey(info.sec, info.n, v[0], v[1])), 0);
      ctl.replaceChildren(h('button', {class: 'pd-b pd-on pd-badge', type: 'button', 'aria-label': T.pick(info.n), html: ICON.plus, onclick: e => { e.stopPropagation(); openProduct(info); }},
        n ? h('span', {class: 'pd-cnt'}, String(n)) : null));
      return;
    }
    const v = info.v[0], q = qtyOf(lineKey(info.sec, info.n, v[0], v[1]));
    if (!q) ctl.replaceChildren(...lead, h('button', {class: 'pd-b pd-on', type: 'button', 'aria-label': T.add(info.n), html: ICON.plus, onclick: e => { e.stopPropagation(); bump(info, v, 1); }}));
    else ctl.replaceChildren(...lead, h('button', {class: 'pd-b', type: 'button', 'aria-label': T.less(info.n), html: ICON.minus, onclick: e => { e.stopPropagation(); bump(info, v, -1); }}),
      h('span', {class: 'pd-n', 'aria-live': 'polite'}, String(q)),
      h('button', {class: 'pd-b', type: 'button', 'aria-label': T.more(info.n), html: ICON.plus, onclick: e => { e.stopPropagation(); bump(info, v, 1); }}));
  };
  ctl.addEventListener('click', e => e.stopPropagation());
  paint(); subs.add(paint); items.push({el, paint});
}
function bindOpen(el) {
  if (el.dataset.pdOpen) return; el.dataset.pdOpen = '1';
  el.addEventListener('click', e => {
    if (e.target.closest('.pd-ctl, a, button') || getSelection()?.toString()) return;
    let data; try { data = JSON.parse(el.dataset.pd); } catch { return; }
    const secEl = el.closest('section');
    openProduct({n: data.n, d: data.d, i: data.i, v: data.v, sec: plain(secEl?.querySelector('h2')?.textContent || '') || 'Carta', order: Math.max(0, sections.indexOf(secEl))});
  });
}

// ---------- barra fija ----------
let barEl;
function paintBar() {
  const n = count();
  barEl.hidden = !n;
  document.body.style.paddingBottom = n ? '88px' : '';
  if (!n) return;
  barEl.firstChild.replaceChildren(
    h('span', {class: 'pd-l'}, icon('list'), store.mode === 'none' ? T.view : T.dine, h('span', {class: 'pd-c'}, T.items(n))),
    h('span', {class: 'pd-t'}, fmt(total())));
}

// ---------- buscador ----------
function setupSearch(root, o) {
  if (o.search === false) return;
  const input = h('input', {type: 'search', placeholder: T.search, 'aria-label': T.searchLabel, autocomplete: 'off', enterkeyhint: 'search'});
  const none = h('p', {class: 'pd-none', hidden: true}, T.none);
  const box = h('div', {class: 'pd-search'}, h('label', {}, icon('search'), input));
  (o.searchBefore ? document.querySelector(o.searchBefore) : root).before(box);
  root.after(none);
  const hiddenByMe = new Set();
  const run = () => {
    const term = norm(input.value.trim());
    let any = false;
    hiddenByMe.forEach(el => { el.hidden = false; }); hiddenByMe.clear();
    root.querySelectorAll('[data-pd]').forEach(el => {
      const ok = !term || norm(el.textContent + ' ' + (el.closest('section')?.querySelector('h2')?.textContent || '')).includes(term);
      if (!ok) { el.hidden = true; hiddenByMe.add(el); } else any = true;
    });
    if (term) root.querySelectorAll(o.containers || 'section, .group, .grp, .board, .items, .cols, .grid').forEach(c => {
      if (!c.querySelector('[data-pd]:not([hidden])')) { c.hidden = true; hiddenByMe.add(c); }
    });
    none.hidden = !term || any;
  };
  input.addEventListener('input', run);
  return run;
}

// ---------- arranque ----------
function init(o = {}) {
  const th = o.theme || {}, map = {btn: 'btn', btnFg: 'btn-fg', bg: 'bg', fg: 'fg', mute: 'mute', line: 'line', price: 'price', font: 'font', head: 'head', field: 'field'};
  for (const [k, v] of Object.entries(th)) if (map[k]) document.documentElement.style.setProperty('--pd-' + map[k], v);
  if (o.key) KEY = 'pedido:' + o.key;
  const root = document.querySelector(o.root || '#menu') || document.querySelector('main');
  load();
  barEl = h('div', {class: 'pd-bar', hidden: true}, h('button', {type: 'button', onclick: openOrder}));
  document.body.append(barEl);
  subs.add(paintBar);
  const rerunSearch = setupSearch(root, o);
  const scan = () => {
    sections = [...document.querySelectorAll('section')];
    root.querySelectorAll('[data-pd]:not([data-pd-ready])').forEach(el => { setupItem(el); });
    root.querySelectorAll('[data-pd]').forEach(bindOpen);
    paintBar(); rerunSearch?.();
  };
  scan();
  // algunas cartas vuelven a dibujar el menú (pestañas): se agregan los controles a lo nuevo
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; setTimeout(() => { queued = false; scan(); }, 30); })
    .observe(root, {childList: true, subtree: true});
}

window.Pedido = {init, attr};
})();
