"""
Modelos de terceiros da cena-mestra (licenças verificadas individualmente).

Fonte dos arquivos: espelho público do Objaverse (allenai/objaverse no Hugging Face), que
redistribui modelos baixáveis do Sketchfab. A licença NÃO é presumida pelo Objaverse:
`fetch()` consulta a API pública do Sketchfab para cada modelo e só aceita CC0 ou CC-BY 4.0
(permitem uso comercial e redistribuição; CC-BY exige crédito). NC, ND e SA são recusadas.
O registro (autor, URL, licença, data da verificação, alterações feitas) vai para
.cache/assets/credits.json → creditos.json do tour.

  python3 pipeline/models.py          # baixa e verifica (sem Blender)
"""
import datetime
import json
import os
import urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIR = os.path.join(REPO, '.cache', 'assets', 'objaverse')
HF = 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/'
ACCEPTED = {'cc0', 'by'}

# front: eixo (no Blender, após importar) para onde o modelo está virado.
# remove: prefixos de objetos retirados (ex.: ímãs/fotos de terceiros na porta da geladeira).
MODELS = {
    'sofa': dict(uid='03550a3529c24611a12aa158747374e0', path=None,
                 front='-x', changes='escala para 1,44 m; tecido clareado para linho cinza; brilho de fibra'),
    'geladeira': dict(uid='930a1ad92ee54b29b718de69f0cd209b', path=None, front='+y',
                      remove=('Foto', 'Pin', 'To Do List'),
                      changes='retirados ímãs, fotos e lista da porta; escala para a vaga da planta; inox escovado'),
    'cadeira': dict(uid='a5aa4613bc5b46baba4d9254d6c9c038', path=None, front='-y',
                    changes='escala para 0,84 m de altura; brilho de fibra'),
}


def _api(uid):
    return json.load(urllib.request.urlopen(f'https://api.sketchfab.com/v3/models/{uid}', timeout=30))


def _objaverse_path(uid):
    import gzip
    idx = os.path.join(REPO, '.cache', 'objaverse', 'object-paths.json.gz')
    if not os.path.exists(idx):
        os.makedirs(os.path.dirname(idx), exist_ok=True)
        urllib.request.urlretrieve(HF + 'object-paths.json.gz', idx)
    return json.load(gzip.open(idx))[uid]


def file_of(key):
    return os.path.join(DIR, f"{key}-{MODELS[key]['uid']}.glb")


def fetch():
    os.makedirs(DIR, exist_ok=True)
    cred_path = os.path.join(REPO, '.cache', 'assets', 'credits.json')
    credits = json.load(open(cred_path)) if os.path.exists(cred_path) else {}
    for key, m in MODELS.items():
        info = _api(m['uid'])
        lic = (info.get('license') or {})
        slug = lic.get('slug')
        if slug not in ACCEPTED:
            raise SystemExit(f'{key}: licença {slug!r} não aceita para uso comercial')
        f = file_of(key)
        if not os.path.exists(f):
            urllib.request.urlretrieve(HF + (m['path'] or _objaverse_path(m['uid'])), f)
        credits[f'Sketchfab:{m["uid"]}'] = c = (dict(source='Sketchfab (arquivo via Objaverse)', id=m['uid'], asset=key, name=info['name'],
                            author=info['user'].get('displayName') or info['user']['username'],
                            author_profile=info['user'].get('profileUrl'), url=info['viewerUrl'],
                            license=lic.get('label'), license_url=lic.get('url'),
                            verified=datetime.date.today().isoformat(),
                            file_mirror=HF + (m['path'] or _objaverse_path(m['uid'])), changes=m['changes']))
        print(f'[ok] {key}: {info["name"]} — {c["author"]} — {lic.get("label")}')
    json.dump(credits, open(cred_path, 'w'), indent=1, ensure_ascii=False)


# -----------------------------------------------------------------------------
# Blender
# -----------------------------------------------------------------------------
ROT_TO_PLUS_X = {'+x': 0.0, '-x': 3.141592653589793, '+y': -1.5707963267948966, '-y': 1.5707963267948966}


def import_model(key, size=None, height=None, coll=None):
    """Importa, retira partes indesejadas, gira para frente = +X, apoia no chão e centraliza.
    size=(prof_x, larg_y, alt_z) escala por eixo; height escala uniforme pela altura."""
    import bpy
    from mathutils import Matrix, Vector
    m = MODELS[key]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=file_of(key))
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.type == 'MESH' and any(o.name.startswith(p) for p in m.get('remove', ())):
            bpy.data.objects.remove(o)
            new.remove(o)
    meshes = [o for o in new if o.type == 'MESH']
    for o in bpy.context.view_layer.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in new if o.type != 'MESH']:
        bpy.data.objects.remove(o)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = f'MOV_{key}'
    if coll:
        for c in ob.users_collection:
            c.objects.unlink(ob)
        coll.objects.link(ob)
    me = ob.data
    me.transform(Matrix.Rotation(ROT_TO_PLUS_X[m['front']], 4, 'Z'))
    xs, ys, zs = ([v.co[i] for v in me.vertices] for i in range(3))
    lo, hi = Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))
    dim = hi - lo
    if size:
        sc = Vector((size[0] / dim.x, size[1] / dim.y, size[2] / dim.z))
    else:
        s = height / dim.z
        sc = Vector((s, s, s))
    me.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
    me.transform(Matrix.Diagonal((*sc, 1)))
    ob['dims'] = [round(d * s, 3) for d, s in zip(dim, sc)]
    ob['scale_applied'] = [round(s, 4) for s in sc]
    return ob


if __name__ == '__main__':
    fetch()
