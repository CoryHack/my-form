async function loadConfig() {
  const res = await fetch('./formConfig.json');
  if (!res.ok) throw new Error('Cannot load formConfig.json');
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function coerce(val, type) {
  if (type === 'number' || type === 'range') return Number(val || 0);
  if (type === 'checkbox') return Boolean(val);
  return val ?? '';
}

function renderField(f) {
  const id = f.name;
  const label = el('label', { for: id }, f.label ?? f.name);
  const hint = f.hint ? el('div', { class: 'hint' }, f.hint) : null;

  let input;
  switch ((f.type || 'text').toLowerCase()) {
    case 'select': {
      input = el('select', { id, name: id, required: f.required ? true : null });
      const opts = Array.isArray(f.options) ? f.options
                 : (f.options && typeof f.options === 'object') ? Object.entries(f.options).map(([v,l]) => ({ value:v, label:l }))
                 : [];
      for (const o of opts) {
        const value = typeof o === 'string' ? o : o.value;
        const labelText = typeof o === 'string' ? o : (o.label ?? o.value);
        input.append(el('option', { value }, labelText));
      }
      if (f.default !== undefined) input.value = f.default;
      break;
    }
    case 'number':
    case 'text': {
      input = el('input', { id, name: id, type: f.type, required: f.required ? true : null, min: f.min, max: f.max, step: f.step, placeholder: f.placeholder });
      if (f.default !== undefined) input.value = f.default;
      break;
    }
    case 'range': {
      const out = el('span', { id: id + '_out' }, '');
      input = el('input', { id, name: id, type:'range', min: f.min ?? 0, max: f.max ?? 100, step: f.step ?? 1, value: f.default ?? f.min ?? 0,
        oninput: () => (out.textContent = input.value) });
      setTimeout(() => input.dispatchEvent(new Event('input')), 0);
      return el('div', { class:'row inline' }, el('div', {}, label, hint ?? ''), el('div', {}, input, ' ', out));
    }
    case 'checkbox': {
      input = el('input', { id, name:id, type:'checkbox' });
      if (f.default) input.checked = true;
      return el('div', { class:'row inline' }, el('div', {}, label, hint ?? ''), input);
    }
    default: {
      input = el('input', { id, name: id, type:'text' });
    }
  }

  const wrap = el('div', { class:'row' }, label, input);
  if (hint) wrap.append(hint);
  return wrap;
}

function collectValues(form, fields) {
  const values = {};
  for (const f of fields) {
    const elRef = form.querySelector(`[name="${f.name}"]`);
    if (!elRef) continue;
    if (f.type === 'checkbox') values[f.name] = elRef.checked;
    else values[f.name] = coerce(elRef.value, f.type);
  }
  return values;
}

function tryComputeTotal(cfg, values) {
  // If config provides totalExpression, compute it with a sandboxed Function.
  // Example: "values.hours * values.rate + values.warranty"
  const expr = cfg.totalExpression || cfg.formula; // support either key
  if (!expr) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('values', expr.startsWith('return') ? expr : `return (${expr});`);
    const result = fn(values);
    if (Number.isFinite(result)) return Number(result);
    return result;
  } catch (e) {
    console.warn('Total calc error:', e);
    return null;
  }
}

function render(cfg) {
  document.getElementById('title').textContent = cfg.title || 'Quote Form';
  document.getElementById('desc').textContent = cfg.description || '';
  const form = document.getElementById('form');
  form.innerHTML = '';

  const fields = (cfg.fields || []).map(f => ({
    ...f,
    name: f.name || f.id || crypto.randomUUID()
  }));

  for (const f of fields) form.append(renderField(f));

  const submit = el('button', { type:'submit' }, cfg.submitLabel || 'Calculate');
  form.append(submit);

  const result = document.getElementById('result');
  form.hidden = false;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = collectValues(form, fields);
    const total = tryComputeTotal(cfg, values);

    result.hidden = false;
    result.innerHTML = '';
    if (total !== null && total !== undefined) {
      result.append(el('div', { class:'total' }, `Total: ${new Intl.NumberFormat(undefined, { style:'currency', currency: cfg.currency || 'USD' }).format(total)}`));
    }
    result.append(el('pre', {}, JSON.stringify(values, null, 2)));
  });
}

loadConfig().then(render).catch(err => {
  document.getElementById('title').textContent = 'Error loading config';
  document.getElementById('desc').textContent = String(err);
});
