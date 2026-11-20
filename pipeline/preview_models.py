"""Prévias rápidas de modelos candidatos (Cycles, baixa resolução): medidas + 3 ângulos.
Uso: python3 pipeline/preview_models.py -- <saida_dir> <arquivo.glb> [...]"""
import bpy, sys, os, json, math
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:]
out_dir, files = args[0], args[1:]
os.makedirs(out_dir, exist_ok=True)
report = {}
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    dim = hi - lo; ctr = (hi + lo) / 2
    tris = sum(len(o.data.polygons) for o in meshes)
    name = os.path.splitext(os.path.basename(f))[0]
    report[name] = dict(dims_m=[round(dim.x, 3), round(dim.y, 3), round(dim.z, 3)], polys=tris)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 480, 360
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.8, 0.82, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    bpy.ops.mesh.primitive_plane_add(size=50, location=(ctr.x, ctr.y, lo.z))
    floor = bpy.context.object; fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.6, 0.6, 1); floor.data.materials.append(fm)
    L = bpy.data.lights.new('key', 'AREA'); L.energy = 600; L.size = 3
    lo_ = bpy.data.objects.new('key', L); sc.collection.objects.link(lo_)
    lo_.location = ctr + Vector((-2.5, -3, 3)); lo_.rotation_euler = (math.radians(50), 0, math.radians(-40))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 35
    R = max(dim.x, dim.y, dim.z)
    # glTF importado: frente do modelo costuma ser -Y no Blender (frente +Z do glTF)
    views = {'34': Vector((0.75, -1.0, 0.55)), 'lado': Vector((1.0, -0.15, 0.25)), 'perto': Vector((0.35, -0.6, 0.45))}
    for v, d in views.items():
        dist = R * (2.1 if v != 'perto' else 0.95)
        cam.location = ctr + d.normalized() * dist
        tgt = ctr if v != 'perto' else ctr + Vector((-dim.x * 0.2, 0, dim.z * 0.1))
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out_dir, f'{name}__{v}.jpg'); sc.render.image_settings.file_format = 'JPEG'
        bpy.ops.render.render(write_still=True)
    print('[preview]', name, report[name])
json.dump(report, open(os.path.join(out_dir, 'dims.json'), 'w'), indent=1)
