import { initLanguage, number, t } from './i18n.js';
import { loadSource, downloadFile } from './github.js';
import { createZip, uniquePath } from './archive.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const queue = new Map();
const savedInputs = { folder: '', release: '' };
const limit = 512 * 1024 ** 2;
let mode = 'folder',
  compress = false,
  job = null,
  rowLimit = 100;
let activeRows = new Map();

for (const slot of document.querySelectorAll('[data-icon]'))
  slot.innerHTML = icon(slot.dataset.icon);
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme').innerHTML = icon(theme === 'dark' ? 'moon' : 'sun');
  $('theme').title = t(theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  $('theme').setAttribute('aria-label', $('theme').title);
}
try {
  setTheme(localStorage.getItem('gitparcel-theme') || 'light');
} catch {
  setTheme('light');
}
$('theme').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try {
    localStorage.setItem('gitparcel-theme', theme);
  } catch {}
};

function formatSize(bytes) {
  if (bytes < 1024) return number(bytes) + ' B';
  const scale = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return number(bytes / 1024 ** scale) + ' ' + ['B', 'KiB', 'MiB', 'GiB'][scale];
}
const selection = () => [...queue.values()].filter((f) => f.selected);
const sum = (files) => files.reduce((n, f) => n + f.size, 0);

// Keep the original messages so an in-progress transfer can switch languages.
let lastFeedback = '';
let lastProgress = null;
function translate(message) {
  if (typeof message === 'string') return t(message);
  return (message.prefix || '') + t(message.key, message.values);
}
function feedback(message = '', error = false) {
  lastFeedback = message;
  $('feedback').textContent = translate(message);
  $('feedback').hidden = !message;
  $('feedback').classList.toggle('error', error);
}
function progress(info) {
  lastProgress = info;
  const {
    status,
    phase,
    log,
    percent = 0,
    bytes = 0,
    total = 0,
    done = 0,
    count = 0,
    speed = null,
    state = 'idle',
  } = info;
  $('transfer').hidden = status === 'Idle' || (status === 'Ready' && total <= limit);
  $('status').lastElementChild.textContent = t(status);
  $('status').dataset.state = state;
  $('phase').textContent = t(phase);
  $('percent').textContent = number(percent);
  $('progress-bar').setAttribute('aria-valuenow', percent);
  $('progress-bar').firstElementChild.style.width = percent + '%';
  $('log').textContent = info.archive
    ? info.archive.name + ' · ' + formatSize(info.archive.size)
    : translate(log);
  $('bytes').textContent = formatSize(bytes) + ' / ' + formatSize(total);
  $('done').textContent = number(done) + ' / ' + number(count);
  $('speed').textContent = speed === null ? '—' : formatSize(speed) + '/s';
}
function ready() {
  const files = selection();
  const tooBig = sum(files) > limit;
  progress({
    status: files.length ? 'Ready' : 'Idle',
    phase: tooBig
      ? 'Selection exceeds 512 MiB'
      : files.length
        ? 'Ready to bundle'
        : 'Waiting for files',
    log: tooBig
      ? 'Deselect files to fit the archive limit.'
      : queue.size
        ? 'Choose files and build your ZIP.'
        : 'Ready when you are.',
    count: files.length,
    total: sum(files),
  });
}
function filtered() {
  const query = $('search').value.trim().toLowerCase();
  return [...queue.values()].filter((f) => (f.name + ' ' + f.repo).toLowerCase().includes(query));
}
function updateControls() {
  const chosen = selection();
  const visible = filtered();
  $('selected-size').textContent = formatSize(sum(chosen));
  $('selected-count').textContent = t('Selected: {count}', { count: chosen.length });
  $('queue-count').textContent = number(queue.size);
  $('total-count').textContent = t('Files: {count}', { count: queue.size });
  $('download').disabled = !!job || !chosen.length || sum(chosen) > limit;
  $('clear').disabled = !!job || !queue.size;
  $('select-all').disabled = !!job || !visible.length;
  $('select-all').checked = visible.length > 0 && visible.every((f) => f.selected);
  $('select-all').indeterminate = !$('select-all').checked && visible.some((f) => f.selected);
  $('settings').disabled = !!job;
  $('load').disabled = !!job;
  $('example').disabled = !!job;
  $('source-url').disabled = !!job;
  $('cancel').hidden = !job;
  document.querySelectorAll('[data-mode]').forEach((b) => (b.disabled = !!job));
}

function renderFiles() {
  activeRows = new Map();
  const files = filtered();
  const fragment = document.createDocumentFragment();
  for (const f of files.slice(0, rowLimit)) {
    const row = document.createElement('tr');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = f.selected;
    check.disabled = !!job;
    check.setAttribute('aria-label', t('Select {path}', { path: f.path }));
    check.onchange = () => {
      f.selected = check.checked;
      updateControls();
      ready();
    };
    row.insertCell().append(check);
    const filename = row.insertCell();
    filename.textContent = f.name;
    const mobileRepo = document.createElement('small');
    mobileRepo.className = 'mobile-repo';
    mobileRepo.textContent = f.repo;
    filename.append(mobileRepo);
    row.insertCell().textContent = f.repo;
    row.insertCell().textContent = formatSize(f.size);
    const status = row.insertCell();
    status.textContent = t(f.status);
    activeRows.set(f.id, status);
    fragment.append(row);
  }
  if (files.length > rowLimit) {
    const row = document.createElement('tr');
    const cell = row.insertCell();
    cell.colSpan = 5;
    const more = document.createElement('button');
    more.textContent = t('Show more files ({count} remaining)', { count: files.length - rowLimit });
    more.onclick = () => {
      rowLimit += 100;
      renderFiles();
    };
    cell.append(more);
    fragment.append(row);
  }
  $('file-list').replaceChildren(fragment);
  $('empty').hidden = !!files.length;
  $('empty').querySelector('strong').textContent = t(
    queue.size ? 'No matching files' : 'Your bundle is empty',
  );
  $('empty').querySelector('p').textContent = t(
    queue.size
      ? 'Try a different file name or repository.'
      : 'Add a source above to start selecting files.',
  );
  const repos = [...new Set([...queue.values()].map((f) => f.repo))];
  $('source-count').textContent = number(repos.length);
  const links = repos.map((repo) => {
    const link = document.createElement('button');
    link.textContent = repo;
    link.onclick = () => {
      $('search').value = repo;
      renderFiles();
      $('files-heading').scrollIntoView({ block: 'center' });
    };
    return link;
  });
  $('sources').hidden = !links.length;
  $('source-links').replaceChildren(...links);
  updateControls();
}
function setFileStatus(f, value) {
  f.status = value;
  if (activeRows.has(f.id)) activeRows.get(f.id).textContent = t(value);
}
function switchMode(next) {
  savedInputs[mode] = $('source-url').value;
  mode = next;
  for (const tab of document.querySelectorAll('[data-mode]')) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', active);
  }
  $('source-url').value = savedInputs[mode];
  renderMode();
  feedback();
}
function renderMode() {
  const folder = mode === 'folder';
  $('input-hint').textContent = t(
    folder
      ? 'Paste a public repository or subfolder URL to load its files.'
      : 'Paste a public release or asset URL to load its downloads.',
  );
  $('source-url').placeholder = folder
    ? 'github.com/owner/repo/tree/main/folder'
    : 'github.com/owner/repo/releases/tag/v1.0';
  $('source-url').setAttribute(
    'aria-label',
    t(folder ? 'GitHub repository or folder URL' : 'GitHub release URL'),
  );
  $('example').querySelector('span').textContent = folder ? 'octocat / Hello-World' : 'cli / cli';
}
document
  .querySelectorAll('[data-mode]')
  .forEach((b) => (b.onclick = () => switchMode(b.dataset.mode)));
$('search').oninput = () => {
  rowLimit = 100;
  renderFiles();
};
$('select-all').onchange = () => {
  const checked = $('select-all').checked;
  for (const file of filtered()) file.selected = checked;
  renderFiles();
  ready();
};
$('clear').onclick = () => {
  queue.clear();
  $('search').value = '';
  rowLimit = 100;
  feedback();
  renderFiles();
  ready();
};
$('cancel').onclick = () => job?.abort();
function setCompression(value) {
  compress = value;
  for (const [id, active] of [
    ['store', !value],
    ['deflate', value],
  ]) {
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-pressed', active);
  }
}
$('store').onclick = () => setCompression(false);
$('deflate').onclick = () => setCompression(true);
try {
  new CompressionStream('deflate-raw');
} catch {
  $('deflate').disabled = true;
  $('deflate').title = 'Deflate is unavailable in this browser.';
}

function explain(error) {
  const networkFailure =
    error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
  return {
    key: networkFailure
      ? 'Could not reach GitHub. Check your connection and retry.'
      : error.message || 'The request could not be completed.',
    values: error.values,
    prefix: error.file ? error.file + ' — ' : '',
  };
}
async function load() {
  if (job) return;
  const input = $('source-url').value.trim();
  if (!input) {
    feedback('Paste a GitHub link to load files.', true);
    $('source-url').focus();
    return;
  }
  job = new AbortController();
  renderFiles();
  feedback('Reading files from GitHub…');
  progress({
    status: 'Loading',
    phase: 'Reading source',
    log: 'Requesting GitHub file metadata…',
    state: 'active',
  });
  try {
    const files = await loadSource(input, mode, job.signal);
    let added = 0;
    for (const file of files)
      if (!queue.has(file.id)) {
        queue.set(file.id, { ...file, selected: true, status: 'Queued' });
        added++;
      }
    $('search').value = '';
    feedback(
      added
        ? {
            key: 'Files added from {repo}: {count}.',
            values: { count: added, repo: files[0].repo },
          }
        : 'These files are already in your queue.',
    );
    ready();
  } catch (error) {
    if (job.signal.aborted) {
      feedback('Source loading cancelled.');
      ready();
    } else {
      feedback(explain(error), true);
      progress({
        status: 'Error',
        phase: 'Source unavailable',
        log: explain(error),
        state: 'error',
      });
    }
  } finally {
    job = null;
    renderFiles();
  }
}
$('load-form').onsubmit = (event) => {
  event.preventDefault();
  load();
};
$('example').onclick = () => {
  $('source-url').value =
    mode === 'folder'
      ? 'https://github.com/octocat/Hello-World'
      : 'https://github.com/cli/cli/releases/latest';
  load();
};
const canvas = $('canvas');
canvas.ondragover = (event) => {
  event.preventDefault();
  if (!job) canvas.classList.add('over');
};
canvas.ondragleave = (event) => {
  if (!canvas.contains(event.relatedTarget)) canvas.classList.remove('over');
};
canvas.ondrop = (event) => {
  event.preventDefault();
  canvas.classList.remove('over');
  if (job) return;
  const value =
    event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
  if (value) {
    $('source-url').value = value.split('\n').find((s) => s && !s.startsWith('#')) || '';
    load();
  }
};

async function bundle() {
  if (job) return;
  const files = selection(),
    total = sum(files);
  if (!files.length || total > limit) return;
  const includeManifest = $('manifest').checked;
  if (files.length + Number(includeManifest) > 65535) {
    feedback('Choose fewer than 65,536 archive entries.', true);
    return;
  }
  const controller = new AbortController();
  job = controller;
  const used = new Set(includeManifest ? ['manifest.json'] : []);
  const names = files.map((f) => uniquePath(f.path, used, !$('structure').checked));
  const entries = new Array(files.length);
  let cursor = 0,
    done = 0,
    bytes = 0,
    failure = null;
  const started = performance.now();
  function report() {
    progress({
      status: 'Fetching',
      phase: 'Downloading files',
      log: 'Fetching from GitHub…',
      state: 'active',
      percent: Math.floor(90 * (total ? bytes / total : done / files.length)),
      bytes,
      total,
      done,
      count: files.length,
      speed: Math.round(bytes / Math.max(0.1, (performance.now() - started) / 1000)),
    });
  }
  files.forEach((f) => (f.status = 'Queued'));
  renderFiles();
  feedback();
  report();
  const timer = setInterval(report, 200);
  async function worker() {
    while (cursor < files.length && !controller.signal.aborted) {
      const index = cursor++,
        file = files[index];
      setFileStatus(file, 'Fetching');
      try {
        entries[index] = {
          name: names[index],
          data: await downloadFile(file, controller.signal, (n) => (bytes += n)),
        };
        setFileStatus(file, 'Fetched');
        done++;
      } catch (error) {
        if (!controller.signal.aborted) {
          failure = error;
          failure.file = file.name;
          setFileStatus(file, 'Failed');
          controller.abort();
        }
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
    clearInterval(timer);
    if (failure) throw failure;
    controller.signal.throwIfAborted();
    if (includeManifest) {
      const manifest = files.map((f, i) => ({
        file: names[i],
        source: f.browserUrl || f.url,
        repository: f.repo,
        revision: f.ref,
        size: f.size,
      }));
      entries.push({
        name: 'manifest.json',
        data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      });
    }
    const zip = await createZip(entries, compress, controller.signal, (index, length) =>
      progress({
        status: 'Packing',
        phase: 'Building ZIP',
        log: 'Writing archive entries…',
        percent: 90 + Math.floor((9 * index) / length),
        bytes,
        total,
        done,
        count: files.length,
        state: 'active',
      }),
    );
    const name = uniquePath(
      ($('archive-name')
        .value.trim()
        .replace(/\.zip$/i, '') || 'gitparcel-bundle') + '.zip',
      new Set(),
      true,
    );
    const link = document.createElement('a'),
      url = URL.createObjectURL(zip);
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    files.forEach((f) => setFileStatus(f, 'Packed'));
    progress({
      status: 'Complete',
      phase: 'Archive ready',
      archive: { name, size: zip.size },
      percent: 100,
      bytes,
      total,
      done,
      count: files.length,
      state: 'complete',
    });
  } catch (error) {
    const cancelled = controller.signal.aborted && !failure;
    files.forEach((f) => {
      if (f.status !== 'Failed') setFileStatus(f, 'Queued');
    });
    progress({
      status: cancelled ? 'Cancelled' : 'Error',
      phase: cancelled ? 'Build cancelled' : 'Build stopped',
      log: cancelled ? 'Your selection is ready to retry.' : explain(error),
      bytes,
      total,
      done,
      count: files.length,
      state: cancelled ? 'idle' : 'error',
    });
  } finally {
    clearInterval(timer);
    job = null;
    renderFiles();
  }
}
$('download').onclick = bundle;
document
  .querySelectorAll('[data-guide]')
  .forEach((button) => (button.onclick = () => $('guide').showModal()));
$('close-guide').onclick = () => $('guide').close();
$('guide').onclick = (event) => {
  if (event.target !== $('guide')) return;
  const rect = $('guide').getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    $('guide').close();
};
initLanguage(
  () => {
    setTheme(document.documentElement.dataset.theme);
    renderMode();
    renderFiles();
    $('feedback').textContent = translate(lastFeedback);
    if ($('deflate').disabled) $('deflate').title = t('Deflate is unavailable in this browser.');
    if (lastProgress) progress(lastProgress);
    else ready();
  },
  () => feedback('Could not load this language. Please try again.', true),
);
