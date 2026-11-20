import { discoveryLimits, maxBundleBytes, maxQueueMetadataBytes } from './limits.js';

const api = 'https://api.github.com/repos/';
const encode = encodeURIComponent;
const discoveryError = 'Source discovery limit reached. Choose a smaller folder or release.';
const ambiguousRef =
  'This revision is ambiguous. Paste a GitHub permalink with the full commit SHA.';

export function parseSource(input, mode) {
  if (input.length > 8192) throw new Error('Enter a valid GitHub repository URL.');
  let value = input.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) value = 'github.com/' + value;
  if (!/^[a-z]+:\/\//i.test(value)) value = 'https://' + value;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid GitHub repository URL.');
  }
  if (
    url.hostname !== 'github.com' ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Use a public github.com repository link.');
  const [owner, rawRepo, kind, ...tail] = url.pathname
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  const name = rawRepo?.replace(/\.git$/, '');
  if (
    !owner ||
    !name ||
    ![owner, name].every((p) => /^[\w.-]+$/.test(p) && p !== '.' && p !== '..')
  )
    throw new Error('Include the owner and repository in the link.');
  const repo = owner + '/' + name;
  if (mode === 'folder') {
    if (kind && (kind !== 'tree' || !tail.length))
      throw new Error('Paste a repository or folder link containing /tree/.');
    return { repo, tail };
  }
  if (kind && kind !== 'releases') throw new Error('Paste a repository or a GitHub release link.');
  const [type, ...rest] = tail;
  if (type === 'tag' && rest.length) return { repo, tag: rest.join('/') };
  if (type === 'download' && rest.length >= 2)
    return { repo, tag: rest.slice(0, -1).join('/'), asset: rest.at(-1) };
  if (type && (type !== 'latest' || rest.length))
    throw new Error('Paste a release tag or latest release link.');
  return { repo, tag: null };
}

async function checked(url, signal, accept = 'application/vnd.github+json') {
  const res = await fetch(url, { headers: { Accept: accept }, signal, credentials: 'omit' });
  if (res.ok) return res;
  await res.body?.cancel();
  let message = 'GitHub returned HTTP {code}. Try again.';
  let values = { code: String(res.status) };
  if (res.status === 404)
    message = 'GitHub could not find this public repository, branch, or release.';
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    message = reset
      ? 'GitHub limited this request. Try again after {time}.'
      : 'GitHub limited this request. Try again later.';
    values = { time: new Date(reset * 1000) };
  }
  const error = new Error(message);
  error.status = res.status;
  error.values = values;
  throw error;
}

function metadataReader(signal, { requests, bytes, entries }) {
  return async (url) => {
    if (requests-- <= 0) throw new Error(discoveryError);
    const response = await checked(url, signal);
    if (Number(response.headers.get('content-length')) > bytes) {
      await response.body?.cancel();
      throw new Error(discoveryError);
    }
    // Fetch may decompress the body. Charge the actual bytes before buffering and parsing JSON.
    const bounded = response.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          bytes -= chunk.byteLength;
          if (bytes < 0) throw new Error(discoveryError);
          controller.enqueue(chunk);
        },
      }),
    );
    const data = await new Response(bounded).json();
    const records = Array.isArray(data) ? data : data.tree ?? data.assets;
    if (Array.isArray(records)) entries -= records.length;
    if (entries < 0) throw new Error(discoveryError);
    return data;
  };
}

async function resolveFolder(base, tail, json) {
  const missing = 'Could not find the branch or tag in this link.';
  async function getCommit(ref) {
    const { sha, commit } = await json(base + '/commits/' + encode(ref) + '?per_page=1');
    return { sha, tree: commit.tree };
  }
  async function getCommitObject(sha) {
    const commit = await json(base + '/git/commits/' + encode(sha.toLowerCase()));
    if (commit.sha !== sha.toLowerCase()) throw new Error(missing);
    return commit;
  }
  if (!tail.length) return { commit: await getCommit('HEAD'), folder: [] };
  const [first, ...rest] = tail;
  if (/^[\da-f]{40}$/i.test(first)) {
    return { commit: await getCommitObject(first), folder: rest };
  }

  const canNameCommit = first === 'HEAD' || /^[\da-f]{4,39}$/i.test(first);
  const path = tail.join('/');
  let match;
  for (const namespace of ['heads', 'tags']) {
    const refs = await json(base + '/git/matching-refs/' + namespace + '/' + encode(first));
    const prefix = 'refs/' + namespace + '/';
    for (const { ref, object } of refs) {
      if (!ref.startsWith(prefix)) continue;
      const name = ref.slice(prefix.length);
      if (path !== name && !path.startsWith(name + '/')) continue;
      // The generic commit endpoint can resolve a hexadecimal name as either a ref or a SHA.
      if (match || (canNameCommit && name === first)) throw new Error(ambiguousRef);
      match = { object, folder: path.slice(name.length + 1).split('/').filter(Boolean) };
    }
  }
  if (canNameCommit) {
    let commit;
    try {
      commit = await getCommit(first);
    } catch (error) {
      if (error.status !== 404 && error.status !== 422) throw error;
    }
    if (commit && (first === 'HEAD' || commit.sha.startsWith(first.toLowerCase()))) {
      if (match) throw new Error(ambiguousRef);
      return { commit, folder: rest };
    }
  }
  if (!match) throw new Error(missing);
  // An annotated tag can point to another tag. Each lookup shares the discovery budget.
  let { object } = match;
  while (object.type === 'tag') {
    const tag = await json(base + '/git/tags/' + encode(object.sha));
    object = tag.object;
  }
  if (object.type !== 'commit') throw new Error(missing);
  return { commit: await getCommitObject(object.sha), folder: match.folder };
}

async function folderFiles({ repo, tail }, json, addFile) {
  const base = api + repo;
  const { commit, folder } = await resolveFolder(base, tail, json);
  const getTree = (sha, recursive = false) =>
    json(base + '/git/trees/' + sha + (recursive ? '?recursive=1' : ''));
  let sha = commit.tree.sha;
  for (const part of folder) {
    const tree = await getTree(sha);
    const node = tree.tree.find((t) => t.type === 'tree' && t.path === part);
    if (!node) throw new Error('This folder was not found on the selected branch.');
    sha = node.sha;
  }
  async function walk(treeSha, prefix) {
    const tree = await getTree(treeSha, true);
    if (tree.truncated) {
      const level = await getTree(treeSha);
      if (level.truncated)
        throw new Error('GitHub could not list this entire folder. Choose a smaller subfolder.');
      for (const node of level.tree) {
        if (node.type === 'tree') await walk(node.sha, prefix + node.path + '/');
        if (node.type === 'blob') add(node, prefix);
      }
    } else for (const node of tree.tree) if (node.type === 'blob') add(node, prefix);
  }
  function add(node, prefix) {
    const path = [...folder, prefix + node.path].join('/');
    addFile({
      id: repo + '/' + commit.sha + '/' + path,
      repo,
      name: path,
      kind: 'folder',
      path: repo + '/' + path,
      size: node.size,
      ref: commit.sha,
      url:
        'https://raw.githubusercontent.com/' +
        repo +
        '/' +
        commit.sha +
        '/' +
        path.split('/').map(encode).join('/'),
      blobUrl: base + '/git/blobs/' + node.sha,
    });
  }
  await walk(sha, '');
}

async function releaseFiles({ repo, tag, asset }, json, addFile) {
  const base = api + repo + '/releases/';
  const release = await json(base + (tag ? 'tags/' + encode(tag) : 'latest'));
  for (let page = 1; ; page++) {
    const batch = await json(base + release.id + '/assets?per_page=100&page=' + page);
    for (const a of batch) {
      if (a.state !== 'uploaded' || (asset && a.name !== asset)) continue;
      addFile({
        id: repo + '/releases/assets/' + a.id,
        assetId: a.id,
        digest: a.digest ?? null,
        repo,
        name: a.name,
        size: a.size,
        kind: 'release',
        path: repo + '/' + release.tag_name + '/' + a.name,
        ref: release.tag_name,
        url: a.url + '?download=1',
        browserUrl: a.browser_download_url,
      });
      if (asset) return;
    }
    if (batch.length < 100) return;
  }
}

export async function loadSource(value, mode, signal, limits = discoveryLimits) {
  const source = parseSource(value, mode);
  const json = metadataReader(signal, limits);
  const items = [];
  let metadataBytes = 0;
  function addFile(file) {
    // Also bound expanded paths and URLs retained after the API response is discarded.
    file.metadataBytes = Object.values(file).reduce(
      (sum, value) => sum + (typeof value === 'string' ? 2 * value.length : 0), 0,
    );
    metadataBytes += file.metadataBytes;
    if (metadataBytes > maxQueueMetadataBytes) throw new Error(discoveryError);
    items.push(file);
  }
  if (mode === 'folder') {
    await folderFiles(source, json, addFile);
    if (!items.length) throw new Error('This folder contains no downloadable files.');
  } else {
    await releaseFiles(source, json, addFile);
    if (!items.length)
      throw new Error('This release has no matching uploaded assets. Try another release tag.');
  }
  return items;
}

export async function downloadFile(file, signal, onChunk) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBundleBytes)
    throw Object.assign(new Error('GitHub returned unexpected content for {name}.'), {
      values: { name: file.name },
    });
  let response;
  if (file.kind === 'folder') {
    try {
      response = await checked(file.url, signal, '*/*');
    } catch (error) {
      signal.throwIfAborted();
      response = await checked(file.blobUrl, signal, 'application/vnd.github.raw+json');
    }
  } else {
    try {
      response = await checked(file.url, signal, 'application/octet-stream');
    } catch (error) {
      signal.throwIfAborted();
      if (error.status) throw error;
      const route = '/api/assets/' + file.repo + '/' + file.assetId;
      response = await fetch(route, { signal, credentials: 'omit' });
      if (!response.ok) {
        await response.body?.cancel();
        if ([413, 429, 504].includes(response.status))
          throw new Error('The release proxy reached a transfer limit. Try again later or choose a smaller asset.');
        throw new Error('The release download failed. Run the GitParcel app server and retry.');
      }
    }
  }
  const data = new Uint8Array(file.size);
  let length = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > file.size) {
        await reader.cancel();
        throw Object.assign(new Error('GitHub returned unexpected content for {name}.'), {
          values: { name: file.name },
        });
      }
      data.set(value, length);
      length += value.length;
      onChunk(value.length);
    }
  }
  if (length !== file.size)
    throw Object.assign(new Error('The download size did not match for {name}. Please retry.'), {
      values: { name: file.name },
    });
  signal.throwIfAborted();
  if (file.kind === 'release' && file.digest != null) {
    if (!globalThis.crypto?.subtle)
      throw new Error('Use HTTPS or localhost to verify release checksums.');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (typeof file.digest !== 'string' || file.digest.toLowerCase() !== 'sha256:' + hex)
      throw Object.assign(new Error('Could not verify the release checksum for {name}.'), {
        values: { name: file.name },
      });
    signal.throwIfAborted();
  }
  return data;
}
