const PUBLIC_URL = 'https://cdn.killobyte.es/files/';
const TEXT_FILE = /\.(json|txt|md|css|js|html|svg|xml|ya?ml|toml|csv)$/i;
const MONACO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min';
const FORMATTABLE = ['json', 'css', 'scss', 'less', 'html', 'javascript', 'typescript'];

const view = document.getElementById('view');
const statusLine = document.getElementById('status');

let editor;

// "#/carpeta/sub" navega por el CDN, "#edit=fichero" abre monaco
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
const join = (...parts) => parts.filter(Boolean).join('/');
const parentOf = (p) => p.split('/').slice(0, -1).join('/');
const folderHash = (dir) => `#/${encodePath(dir)}`;
const editHash = (file) => `#edit=${encodePath(file)}`;

function setStatus(text, isError = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle('error', isError);
}

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el[key] = value;
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const errorMessage = (text, status) => {
  try { return JSON.parse(text).error; } catch { return `HTTP ${status}`; }
};

async function api(method, path, { body, json } = {}) {
  const init = json
    ? { method, body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } }
    : { method, body };
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(errorMessage(await res.text(), res.status));
  return res;
}

function uploadFile(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/files/${encodePath(path)}`);
    xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(errorMessage(xhr.responseText, xhr.status))));
    xhr.onerror = () => reject(new Error('Error de red'));
    xhr.send(file);
  });
}

const formatSize = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
};

async function showFolder(dir) {
  const items = await (await api('GET', `/api/files/${encodePath(dir)}`)).json();

  const upload = async (files) => {
    const existing = new Set(items.map((i) => i.name));
    for (const file of files) {
      if (existing.has(file.name) && !confirm(`${file.name} ya existe. ¿Sobrescribir?`)) continue;
      await uploadFile(join(dir, file.name), file, (p) => setStatus(`Subiendo ${file.name}… ${Math.round(p * 100)}%`));
    }
    await route();
    setStatus(`Subido ✓ (${files.length} archivo${files.length === 1 ? '' : 's'})`);
  };

  const run = (action) => async () => {
    try { await action(); } catch (err) { setStatus(err.message, true); }
  };

  const picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: run(() => upload([...picker.files])) });

  const newFolder = run(async () => {
    const name = prompt('Nombre de la carpeta');
    if (!name) return;
    await api('POST', `/api/folders/${encodePath(join(dir, name))}`);
    location.hash = folderHash(join(dir, name));
  });

  const move = (path) => run(async () => {
    const to = prompt('Nueva ruta (puedes cambiar de carpeta)', path);
    if (!to || to === path) return;
    await api('POST', '/api/move', { json: { from: path, to } });
    await route();
    setStatus(`Movido a ${to} ✓`);
  });

  const remove = (item, path) => run(async () => {
    const what = item.type === 'directory' ? `la carpeta ${path} y TODO su contenido` : path;
    if (!confirm(`¿Borrar ${what}?`)) return;
    await api('DELETE', `/api/files/${encodePath(path)}`);
    await route();
    setStatus(`Borrado ${path} ✓`);
  });

  const crumbs = [h('a', { href: '#/', textContent: 'files' })];
  dir.split('/').filter(Boolean).forEach((part, i, parts) => {
    crumbs.push(h('span', { textContent: ' / ' }), h('a', { href: folderHash(parts.slice(0, i + 1).join('/')), textContent: part }));
  });

  const rows = items.map((item) => {
    const path = join(dir, item.name);
    const isDir = item.type === 'directory';
    return h('tr', {},
      h('td', { className: 'name' }, isDir
        ? h('a', { href: folderHash(path), textContent: `${item.name}/` })
        : h('a', { href: PUBLIC_URL + encodePath(path), target: '_blank', rel: 'noopener', textContent: item.name })),
      h('td', { className: 'meta', textContent: isDir ? '' : formatSize(item.size) }),
      h('td', { className: 'meta', textContent: new Date(item.mtime).toLocaleString('es-ES') }),
      h('td', { className: 'actions' },
        !isDir && TEXT_FILE.test(item.name) && h('a', { className: 'button', href: editHash(path), textContent: 'editar' }),
        h('button', { textContent: 'mover', onclick: move(path) }),
        h('button', { className: 'danger', textContent: 'borrar', onclick: remove(item, path) })));
  });

  const drop = h('div', {
    className: 'drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); run(() => upload([...e.dataTransfer.files]))(); },
  }, rows.length
    ? h('table', {}, h('tbody', {}, rows))
    : h('p', { className: 'empty', textContent: 'Carpeta vacía. Arrastra archivos aquí para subirlos.' }));

  view.replaceChildren(
    h('div', { className: 'toolbar' },
      h('div', { className: 'crumbs' }, crumbs),
      picker,
      h('button', { className: 'primary', textContent: 'subir archivos', onclick: () => picker.click() }),
      h('button', { textContent: 'nueva carpeta', onclick: newFolder })),
    drop);
}

let monacoPromise;
function loadMonaco() {
  monacoPromise ??= new Promise((resolve, reject) => {
    window.MonacoEnvironment = {
      getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `self.MonacoEnvironment = { baseUrl: '${MONACO_URL}/' }; importScripts('${MONACO_URL}/vs/base/worker/workerMain.js');`)}`,
    };
    const loader = h('script', { src: `${MONACO_URL}/vs/loader.min.js`, onerror: () => reject(new Error('No se pudo cargar Monaco')) });
    loader.onload = () => {
      window.require.config({ paths: { vs: `${MONACO_URL}/vs` } });
      window.require(['vs/editor/editor.main'], () => {
        const css = getComputedStyle(document.documentElement);
        const color = (name) => css.getPropertyValue(`--kb-${name}`).trim();
        window.monaco.editor.defineTheme('kb', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': color('green-night'),
            'editor.foreground': color('text'),
            'editorLineNumber.foreground': color('green-dark'),
            'editorLineNumber.activeForeground': color('green'),
            'editorCursor.foreground': color('orange'),
            'editor.selectionBackground': color('green-dark'),
          },
        });
        resolve(window.monaco);
      }, reject);
    };
    document.head.append(loader);
  });
  monacoPromise.catch(() => { monacoPromise = undefined; });
  return monacoPromise;
}

async function showEditor(file) {
  const [text, monaco] = await Promise.all([
    api('GET', `/api/files/${encodePath(file)}`).then((res) => res.text()),
    loadMonaco(),
  ]);

  const save = async () => {
    try {
      await api('PUT', `/api/files/${encodePath(file)}`, { body: editor.getValue() });
      setStatus(`Guardado ${file} ✓ ${new Date().toLocaleTimeString('es-ES')}`);
    } catch (err) {
      setStatus(err.message, true);
    }
  };

  const container = h('div', { className: 'editor' });
  editor = monaco.editor.create(container, {
    model: monaco.editor.createModel(text, undefined, monaco.Uri.file(file)),
    theme: 'kb',
    automaticLayout: true,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    tabSize: 2,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save);
  const canFormat = FORMATTABLE.includes(editor.getModel().getLanguageId());
  const format = () => editor.getAction('editor.action.formatDocument').run();

  view.replaceChildren(
    h('div', { className: 'toolbar' },
      h('div', { className: 'crumbs' }, h('a', { href: folderHash(parentOf(file)), textContent: '← volver' }), h('span', { textContent: ` ${file}` })),
      canFormat && h('button', { textContent: 'formatear', onclick: format }),
      h('a', { className: 'button', href: PUBLIC_URL + encodePath(file), target: '_blank', rel: 'noopener', textContent: 'ver público' }),
      h('button', { className: 'primary', textContent: 'guardar (ctrl+s)', onclick: save })),
    container);
  editor.focus();
}

async function route() {
  const hash = decodeURIComponent(location.hash);
  editor?.getModel()?.dispose();
  editor?.dispose();
  editor = undefined;
  setStatus('');
  try {
    if (hash.startsWith('#edit=')) await showEditor(hash.slice('#edit='.length));
    else await showFolder(hash.replace(/^#\/?/, '').replace(/\/$/, ''));
  } catch (err) {
    setStatus(err.message, true);
  }
}

addEventListener('hashchange', route);
route();

api('GET', '/api/me').then((res) => res.json()).then(({ user }) => {
  document.querySelector('kb-header').setAttribute('tag', `administración · ${user}`);
}).catch(() => {});
