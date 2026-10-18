// Tiny image buffers generated in code, so no binary fixtures are committed.
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** A valid 1x1 RGB PNG image generated in code. */
export function tinyPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); // width
  header.writeUInt32BE(1, 4); // height
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const scanline = Buffer.from([0, 0x6b, 0x8f, 0x5e]); // filter byte + one sage-green pixel
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanline)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A minimal JPEG-signed buffer (SOI + JFIF APP0 + EOI). The server checks only the signature,
 * so this is enough to exercise the JPEG branch without committing a binary file.
 */
export function tinyJpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

/** A buffer of exactly `size` bytes that starts with the PNG signature. */
export function pngOfSize(size) {
  const buffer = Buffer.alloc(size);
  PNG_SIGNATURE.copy(buffer);
  return buffer;
}
