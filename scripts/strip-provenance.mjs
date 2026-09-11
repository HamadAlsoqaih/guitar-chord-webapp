#!/usr/bin/env node
/**
 * Strips embedded content-provenance metadata (C2PA) from the character assets.
 *
 * The design tool that produced these files bakes a provenance manifest into each
 * one. It is inert — nothing in the app reads it — but it ships in the repo, so it
 * is removed here. Re-run this after replacing any asset from the original bundle.
 *
 *   node scripts/strip-provenance.mjs [--check]
 *
 * --check reports what would be removed without writing anything.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ASSETS = [
  'public/assets/bubble.png',
  'public/assets/koko.png',
  'public/assets/koko-f1.png',
  'public/assets/koko-f2.png',
  'public/assets/koko-idle.mp4',
]

/** PNG chunks that carry metadata rather than pixels. */
const PNG_DROP = new Set(['caBX', 'eXIf', 'iTXt', 'tEXt', 'zTXt'])

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** CRC-32, needed because every PNG chunk carries one over its type and data. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Rebuilds a PNG without its metadata chunks.
 *
 * Chunks are only dropped, never re-encoded, so the pixels are bit-identical. Each
 * surviving chunk keeps its original CRC; only the file's chunk list changes.
 */
function stripPng(data) {
  if (!data.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('not a PNG')
  const kept = [data.subarray(0, 8)]
  const removed = []
  let i = 8
  while (i < data.length) {
    const length = data.readUInt32BE(i)
    const type = data.subarray(i + 4, i + 8).toString('latin1')
    const end = i + 12 + length
    if (PNG_DROP.has(type)) removed.push({ type, length })
    else kept.push(data.subarray(i, end))
    i = end
  }
  return { out: Buffer.concat(kept), removed }
}

/**
 * Neutralises the ISO-BMFF `uuid` boxes an MP4 uses to carry a C2PA manifest.
 *
 * The boxes are retyped to `free` and their payload zeroed rather than removed.
 * They sit ahead of `mdat`, and `moov`'s stco/co64 tables address sample data by
 * absolute file offset — cutting bytes out here would silently shift every one of
 * those offsets and break playback. `free` is the box type that exists to mean
 * "skip this", so the file keeps its exact length and layout and the payload is
 * gone.
 */
function stripMp4(data) {
  const out = Buffer.from(data)
  const removed = []
  let i = 0
  while (i + 8 <= out.length) {
    let size = out.readUInt32BE(i)
    let header = 8
    if (size === 1) {
      size = Number(out.readBigUInt64BE(i + 8))
      header = 16
    } else if (size === 0) {
      size = out.length - i
    }
    if (size < header) break
    const type = out.subarray(i + 4, i + 8).toString('latin1')
    if (type === 'uuid') {
      out.write('free', i + 4, 'latin1')
      out.fill(0, i + header, i + size)
      removed.push({ type, length: size })
    }
    i += size
  }
  return { out, removed }
}

const check = process.argv.includes('--check')
let touched = 0

for (const relative of ASSETS) {
  const path = resolve(relative)
  const data = readFileSync(path)
  const { out, removed } = relative.endsWith('.png') ? stripPng(data) : stripMp4(data)

  if (!removed.length) {
    console.log(`${relative}: already clean`)
    continue
  }
  touched += 1
  const detail = removed.map((r) => `${r.type} (${r.length}B)`).join(', ')
  console.log(
    `${relative}: ${check ? 'would remove' : 'removed'} ${detail}` +
      ` — ${data.length} → ${out.length} bytes`
  )
  if (!check) writeFileSync(path, out)
}

console.log(touched ? `${touched} file(s) ${check ? 'need cleaning' : 'cleaned'}` : 'nothing to do')
