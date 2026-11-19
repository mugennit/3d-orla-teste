"""Baixa assets CC0 do Poly Haven e do ambientCG para .cache/assets e registra créditos.

Uso:
  python3 pipeline/fetch_assets.py ph-tex <id> [res]      # textura Poly Haven (diff, nor_gl, rough, arm/ao, disp)
  python3 pipeline/fetch_assets.py ph-model <id> [res]    # modelo Poly Haven (glTF + texturas)
  python3 pipeline/fetch_assets.py acg <AssetId> [res]    # material ambientCG (zip JPG)
Licença: todos os assets dessas bibliotecas são CC0 (domínio público).
"""
import io, json, os, sys, urllib.request, zipfile

ROOT = os.path.join(os.path.dirname(__file__), '..', '.cache', 'assets')
CREDITS = os.path.join(ROOT, 'credits.json')
UA = {'User-Agent': 'tour3d-asset-fetcher/1.0'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def credit(source, asset_id, url):
    c = json.load(open(CREDITS)) if os.path.exists(CREDITS) else {}
    c[f'{source}:{asset_id}'] = {'source': source, 'id': asset_id, 'url': url, 'license': 'CC0 1.0'}
    os.makedirs(ROOT, exist_ok=True)
    json.dump(c, open(CREDITS, 'w'), indent=1)


def ph_tex(asset, res='2k'):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    out = os.path.join(ROOT, 'ph', asset)
    for key, alias in [('Diffuse', 'diff'), ('nor_gl', 'nor_gl'), ('Rough', 'rough'), ('AO', 'ao'), ('arm', 'arm'), ('Displacement', 'disp'), ('Metal', 'metal')]:
        if key in files and res in files[key]:
            info = files[key][res].get('jpg') or files[key][res].get('png')
            ext = info['url'].rsplit('.', 1)[-1]
            p = os.path.join(out, f'{alias}_{res}.{ext}')
            if not os.path.exists(p):
                save(p, get(info['url']))
    credit('Poly Haven', asset, f'https://polyhaven.com/a/{asset}')
    return out


def ph_model(asset, res='2k'):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    g = files['gltf'][res]['gltf']
    out = os.path.join(ROOT, 'ph', asset, res)
    p = os.path.join(out, f'{asset}.gltf')
    if not os.path.exists(p):
        save(p, get(g['url']))
        for rel, inc in g.get('include', {}).items():
            save(os.path.join(out, rel), get(inc['url']))
    credit('Poly Haven', asset, f'https://polyhaven.com/a/{asset}')
    return p


def acg(asset, res='2K'):
    out = os.path.join(ROOT, 'acg', asset)
    if not os.path.isdir(out):
        data = get(f'https://ambientcg.com/get?file={asset}_{res}-JPG.zip')
        zipfile.ZipFile(io.BytesIO(data)).extractall(out)
    credit('ambientCG', asset, f'https://ambientcg.com/view?id={asset}')
    return out


if __name__ == '__main__':
    kind, asset = sys.argv[1], sys.argv[2]
    res = sys.argv[3] if len(sys.argv) > 3 else None
    fn = {'ph-tex': ph_tex, 'ph-model': ph_model, 'acg': acg}[kind]
    print(fn(asset, res) if res else fn(asset))
