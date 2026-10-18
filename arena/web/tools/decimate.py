# Makes lighter copies of .glb models in headless Blender: collapses each mesh to about CAP triangles (never below a fifth of it).
# Blender cannot read meshopt-compressed files: unpack first (drop EXT_meshopt_compression with gltf-transform), then run shrink-models.mjs on the result.
# Usage: blender -b -P decimate.py -- <from-folder> <to-folder> <triangle-cap>
import bpy, sys, os
src, dst, cap = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.glb'): continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, max(0.2, cap / max(1, tris)))
    if ratio < 1.0:
        for o in meshes:
            bpy.context.view_layer.objects.active = o
            m = o.modifiers.new('d', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier='d')
    after = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print('RESULT', f, tris, '->', after)
    bpy.ops.export_scene.gltf(filepath=os.path.join(dst, f), export_format='GLB')
