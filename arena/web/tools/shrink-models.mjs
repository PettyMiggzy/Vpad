// Makes a lighter copy of a folder of .glb models for phones: drops emissive maps that are plain black (they cost graphics memory and show
// nothing) and scales every other texture down so no side is longer than MAX. Geometry is untouched and stays meshopt-compressed.
// Needs, outside this project's own dependencies: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
// Usage: node shrink-models.mjs <from-folder> <to-folder> <max-size> [name-pattern]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, dst, maxArg, pattern] = process.argv.slice(2);
const MAX = Number(maxArg);
if (!src || !dst || !(MAX >= 16)) { console.error('usage: node shrink-models.mjs <from> <to> <max-size> [pattern]'); process.exit(1); }
fs.mkdirSync(dst, { recursive: true });
const only = pattern ? new RegExp(pattern) : null;

/** true when a texture is one flat dark colour, so a light factor of zero looks the same */
async function isBlank(tex) {
  const img = tex.getImage(); if (!img) return false;
  const { data } = await sharp(Buffer.from(img)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let max = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  return max < 60;
}

let before = 0, after = 0;
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.glb') && (!only || only.test(x)))) {
  const doc = await io.read(`${src}/${f}`);
  let dropped = 0;
  for (const m of doc.getRoot().listMaterials()) {
    const e = m.getEmissiveTexture();
    if (e && await isBlank(e)) { m.setEmissiveTexture(null); m.setEmissiveFactor([0, 0, 0]); dropped++; }
  }
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [MAX, MAX], quality: 82 }));
  for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((p) => p.propertyType !== 'Root')) t.dispose();
  if (!doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'EXT_meshopt_compression')).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  }
  await io.write(`${dst}/${f}`, doc);
  const a = fs.statSync(`${src}/${f}`).size, b = fs.statSync(`${dst}/${f}`).size;
  before += a; after += b;
  console.log(f.padEnd(26), `${(a / 1e3).toFixed(0)} KB -> ${(b / 1e3).toFixed(0)} KB`, dropped ? `(dropped ${dropped} blank emissive)` : '');
}
console.log(`total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
