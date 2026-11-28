// Draws one tooltip model sent by main.js: { title, sub, rows: [[label, value, cls]], lines, note }.
const box = document.getElementById('tip');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render(m) {
  box.replaceChildren();
  if (typeof m === 'string') m = { lines: m.split('\n') };
  m = m || {};
  if (m.title) {
    const t = el('div', 't');
    t.append(el('span', 'main', m.title));
    if (m.sub) t.append(el('span', 'sub', m.sub));
    box.appendChild(t);
  }
  if (m.rows && m.rows.length) {
    const t = el('table', 'kv');
    for (const [k, v, cls] of m.rows) {
      const tr = el('tr');
      tr.append(el('td', null, k), el('td', cls || '', v));
      t.appendChild(tr);
    }
    box.appendChild(t);
  }
  for (const line of m.lines || []) box.appendChild(el('div', 'line', line));
  if (m.note) box.appendChild(el('div', 'note', m.note));
}

// report the finished size with the request's number; main.js shows the window only
// then, already at that size - no growing or re-wrapping on screen
let seq = 0;
window.mangho.onFeed((d) => {
  if (d.type !== 'tip') return;
  seq = d.seq;
  // 글자 % (main.js): the reading text and the box's cap grow, measured below at that size
  document.documentElement.style.setProperty('--text', String(d.text || 1));
  render(d.model);
  // measured at once (getBoundingClientRect lays the page out): an animation frame may
  // never come while this window sits at opacity 0, and then the tooltip never showed
  report();
});
function report() {
  const r = box.getBoundingClientRect();
  window.mangho.tip('size', { seq, w: Math.ceil(r.width) + 2, h: Math.ceil(r.height) + 2 });
}
// and again whenever the box changes size after that - a font that arrives late (the emoji
// font) re-wraps the text, and the window kept the first size: the last lines were cut off
new ResizeObserver(() => { if (seq) report(); }).observe(box);
