const api = 'https://api.github.com/repos/';
const encode = encodeURIComponent;

export function parseSource(input, mode) {
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

async function json(url, signal) {
  return (await checked(url, signal)).json();
}

async function folderFiles(source, signal) {
  const { repo, tail } = source;
  const base = api + repo;
  let ref = 'HEAD',
    commit,
    folder = [];
  if (!tail.length) commit = await json(base + '/commits/HEAD', signal);
  else {
    for (let length = 1; length <= tail.length; length++) {
      ref = tail.slice(0, length).join('/');
      try {
        commit = await json(base + '/commits/' + encode(ref), signal);
        folder = tail.slice(length);
        break;
      } catch (error) {
        if (error.status !== 404 && error.status !== 422) throw error;
      }
    }
    if (!commit) throw new Error('Could not find the branch or tag in this link.');
  }
  const getTree = (sha, recursive = false) =>
    json(base + '/git/trees/' + sha + (recursive ? '?recursive=1' : ''), signal);
  let sha = commit.commit.tree.sha;
  for (const part of folder) {
    const tree = await getTree(sha);
    const node = tree.tree.find((t) => t.type === 'tree' && t.path === part);
    if (!node) throw new Error('This folder was not found on the selected branch.');
    sha = node.sha;
  }
  const items = [];
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
    items.push({
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
  if (!items.length) throw new Error('This folder contains no downloadable files.');
  return items;
}

async function releaseFiles(source, signal) {
  const { repo, tag, asset } = source;
  const base = api + repo + '/releases/';
  const release = await json(base + (tag ? 'tags/' + encode(tag) : 'latest'), signal);
  const assets = [];
  for (let page = 1; ; page++) {
    const batch = await json(base + release.id + '/assets?per_page=100&page=' + page, signal);
    assets.push(...batch);
    if (batch.length < 100) break;
  }
  const items = assets
    .filter((a) => a.state === 'uploaded' && (!asset || a.name === asset))
    .map((a) => ({
      id: repo + '/releases/assets/' + a.id,
      assetId: a.id,
      repo,
      name: a.name,
      size: a.size,
      kind: 'release',
      path: repo + '/' + release.tag_name + '/' + a.name,
      ref: release.tag_name,
      url: a.url + '?download=1',
      browserUrl: a.browser_download_url,
    }));
  if (!items.length)
    throw new Error('This release has no matching uploaded assets. Try another release tag.');
  return items;
}

export function loadSource(value, mode, signal) {
  const source = parseSource(value, mode);
  return mode === 'folder' ? folderFiles(source, signal) : releaseFiles(source, signal);
}

export async function downloadFile(file, signal, onChunk) {
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
      if (!response.ok)
        throw new Error('The release download failed. Run the GitParcel app server and retry.');
    }
  }
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > file.size) {
      await reader.cancel();
      throw Object.assign(new Error('GitHub returned unexpected content for {name}.'), {
        values: { name: file.name },
      });
    }
    chunks.push(value);
    onChunk(value.length);
  }
  if (length !== file.size)
    throw Object.assign(new Error('The download size did not match for {name}. Please retry.'), {
      values: { name: file.name },
    });
  return new Uint8Array(await new Blob(chunks).arrayBuffer());
}
