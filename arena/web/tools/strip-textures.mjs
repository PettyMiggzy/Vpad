// Makes the texture-free far copy of a model (positions, normals, uv only) that a distance level of detail swaps in; the near model's material is reused at run time.
// Usage: node strip-textures.mjs <from-folder> <to-folder>   (writes <name>_far.glb)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, dst] = process.argv.slice(2); fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.glb'))) {
  const doc = await io.read(`${src}/${f}`);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { for (const a of p.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(a)) p.setAttribute(a, null); }
  doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'EXT_meshopt_compression')).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(`${dst}/${f.replace('.glb', '_far.glb')}`, doc);
  console.log(f, fs.statSync(`${dst}/${f.replace('.glb', '_far.glb')}`).size, 'bytes');
}
