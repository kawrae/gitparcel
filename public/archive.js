const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

// Keep the next suffix with its bundle's occupied-name set, including any reserved names.
const suffixesBySet = new WeakMap();

export function uniquePath(input, used, flat) {
  const parts = input
    .replaceAll('\\', '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || '_');
  const base = (flat ? parts.at(-1) : parts.join('/')) || 'file';
  const key = base.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    suffixesBySet.get(used)?.delete(key);
    return base;
  }
  let suffixes = suffixesBySet.get(used);
  if (!suffixes) {
    suffixes = new Map();
    suffixesBySet.set(used, suffixes);
  }
  const extension =
    base.lastIndexOf('.') > base.lastIndexOf('/') + 1 ? base.lastIndexOf('.') : base.length;
  let suffix = suffixes.get(key) ?? 2;
  let path;
  do {
    path = base.slice(0, extension) + ' (' + suffix++ + ')' + base.slice(extension);
  } while (used.has(path.toLowerCase()));
  suffixes.set(key, suffix);
  used.add(path.toLowerCase());
  return path;
}

function header(size, signature, fields16, fields32) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  for (const [offset, value] of fields16) view.setUint16(offset, value, true);
  for (const [offset, value] of fields32) view.setUint32(offset, value, true);
  return bytes;
}

export async function createZip(entries, compress = false, signal, onProgress = () => {}) {
  if (entries.length > 65535) throw new Error('Choose fewer than 65,536 archive entries.');
  const files = [],
    directory = [];
  let offset = 0,
    dirSize = 0;
  const now = new Date();
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  for (const [index, entry] of entries.entries()) {
    signal?.throwIfAborted();
    const name = encoder.encode(entry.name);
    if (name.length > 65535) throw new Error('An archive path is too long.');
    let crc = 0xffffffff;
    for (const byte of entry.data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const body = new Blob([entry.data]);
    const payload = compress
      ? await new Response(body.stream().pipeThrough(new CompressionStream('deflate-raw'))).blob()
      : body;
    const method = compress ? 8 : 0;
    const local = header(
      30,
      0x04034b50,
      [
        [4, 20],
        [6, 2048],
        [8, method],
        [10, time],
        [12, date],
        [26, name.length],
      ],
      [
        [14, crc],
        [18, payload.size],
        [22, body.size],
      ],
    );
    const central = header(
      46,
      0x02014b50,
      [
        [4, 20],
        [6, 20],
        [8, 2048],
        [10, method],
        [12, time],
        [14, date],
        [28, name.length],
      ],
      [
        [16, crc],
        [20, payload.size],
        [24, body.size],
        [42, offset],
      ],
    );
    files.push(local, name, payload);
    directory.push(central, name);
    offset += local.length + name.length + payload.size;
    dirSize += central.length + name.length;
    onProgress(index + 1, entries.length);
    if (index % 32 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  if (offset + dirSize > 0xffffffff) throw new Error('This archive exceeds the ZIP size limit.');
  const end = header(
    22,
    0x06054b50,
    [
      [8, entries.length],
      [10, entries.length],
    ],
    [
      [12, dirSize],
      [16, offset],
    ],
  );
  return new Blob([...files, ...directory, end], { type: 'application/zip' });
}
