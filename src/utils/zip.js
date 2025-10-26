const buildCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
};

const CRC_TABLE = buildCrcTable();

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

const encodePath = (value) => {
  if (textEncoder) {
    return textEncoder.encode(value);
  }
  const encoded = encodeURIComponent(value);
  const bytes = [];
  for (let i = 0; i < encoded.length; i += 1) {
    const char = encoded[i];
    if (char === "%" && i + 2 < encoded.length) {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return new Uint8Array(bytes);
};

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

export const createZip = async (files) => {
  if (!Array.isArray(files) || files.length === 0) {
    return new Blob([], { type: "application/zip" });
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let entryCount = 0;

  for (const file of files) {
    if (!file || !file.path || !file.data) continue;
    const nameBuf = encodePath(file.path);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBuf.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBuf.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBuf, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBuf.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBuf.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBuf, 46);
    centralParts.push(central);
    offset += local.length + data.length;
    entryCount += 1;
  }

  if (entryCount === 0) {
    return new Blob([], { type: "application/zip" });
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entryCount, true);
  endView.setUint16(10, entryCount, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  const totalSize =
    localParts.reduce((total, part) => total + part.length, 0) +
    centralSize +
    end.length;
  const zip = new Uint8Array(totalSize);
  let pointer = 0;

  for (const part of localParts) {
    zip.set(part, pointer);
    pointer += part.length;
  }

  for (const part of centralParts) {
    zip.set(part, pointer);
    pointer += part.length;
  }

  zip.set(end, pointer);

  return new Blob([zip], { type: "application/zip" });
};

export default createZip;
