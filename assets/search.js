// City search box with suggestions (Open-Meteo Geocoding), keyboard friendly.
import { searchCities, placeLabel } from './data.js';
import { esc } from './ui.js';

/**
 * form: a <form class="search"> with an <input>. onPick(place) is called with the chosen place.
 * Pressing Enter without choosing picks the first suggestion.
 */
export function attachSearch(form, onPick, { autofocus = false } = {}) {
  const input = form.querySelector('input');
  const list = document.createElement('ul');
  list.className = 'suggest';
  list.id = `sug-${Math.random().toString(36).slice(2, 8)}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  form.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.autocomplete = 'off';

  let results = [], active = -1, timer, seq = 0, pending = null;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const paint = (msg) => {
    if (msg) { list.innerHTML = `<li class="empty" role="option" aria-disabled="true">${esc(msg)}</li>`; }
    else list.innerHTML = results.map((r, i) => `<li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${i === active}"><span>${esc(r.name)}</span><small>${esc([r.admin1, r.country].filter(Boolean).join(', '))}</small></li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', active >= 0 ? `${list.id}-${active}` : '');
  };
  const pick = (r) => { if (!r) return; input.value = placeLabel(r); close(); onPick(r); };

  async function lookup(q) {
    const my = ++seq;
    pending = searchCities(q).catch(() => null);
    const r = await pending;
    if (my !== seq) return;
    if (r === null) return paint('City search is busy — try again in a minute.');
    results = r; active = r.length ? 0 : -1;
    paint(r.length ? '' : `No city called “${q}” — check the spelling or try a nearby bigger city.`);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results = []; close(); return; }
    timer = setTimeout(() => lookup(q), 220);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) pick(results[Number(li.dataset.i)]); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) { input.focus(); return; }
    if (!results.length || list.hidden) { clearTimeout(timer); await lookup(q); }
    else if (pending) await pending;
    if (results.length) pick(results[Math.max(0, active)]);
  });
  if (autofocus) input.focus();
  return { input, close };
}
