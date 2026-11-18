"""Join geoBoundaries KHM ADM1-3 polygons (CC BY 4.0, ODC 2014) with Pumi codes
and Khmer names (MIT), and write the files the app needs."""
import json, re, sys
from difflib import SequenceMatcher
import yaml
from shapely.geometry import shape, mapping, Point
from shapely import make_valid

D = sys.argv[1]  # data dir
OUT = sys.argv[2]

def load(level):
    return json.load(open(f'{D}/KHM-{level}.geojson'))['features']

def pumi(kind):
    return yaml.safe_load(open(f'{D}/pumi/data/{kind}.yml'))[kind]

P, Dd, C, V = pumi('provinces'), pumi('districts'), pumi('communes'), pumi('villages')

def norm(s):
    s = s.lower().replace('krong ', '').replace('khan ', '').replace('sangkat ', '').replace('srok ', '')
    return re.sub(r'[^a-z0-9]', '', s)

def sim(a, b):
    return SequenceMatcher(None, norm(a), norm(b)).ratio()

def geo_point(rec):
    g = rec.get('geodata') or {}
    try:
        return Point(float(g['long']), float(g['lat']))
    except Exception:
        return None

def geom(f):
    g = shape(f['geometry'])
    return g if g.is_valid else make_valid(g)

# ---- provinces by ISO ----
iso_to_code = {v.get('iso3166_2'): k for k, v in P.items()}
provs = []
for f in load('ADM1'):
    code = iso_to_code.get(f['properties']['shapeISO'])
    if not code:
        best = max(P, key=lambda k: sim(P[k]['name']['latin'], f['properties']['shapeName']))
        code = best
    provs.append({'code': code, 'g': geom(f), 'en': P[code]['name']['latin'], 'km': P[code]['name']['km']})
print('provinces', len(provs), len({p['code'] for p in provs}))

def container(geo, parents):
    pt = geo.representative_point()
    for p in parents:
        if p['g'].contains(pt):
            return p
    return min(parents, key=lambda p: p['g'].distance(pt))

def match(features, parents, pumi_tbl, code_len, label):
    items = []
    for f in features:
        g = geom(f)
        par = container(g, parents)
        items.append({'g': g, 'src': f['properties']['shapeName'], 'parent': par})
    # candidate scoring within parent prefix
    scored = []
    for i, it in enumerate(items):
        pc = it['parent']['code']
        for code, rec in pumi_tbl.items():
            if not code.startswith(pc):
                continue
            s = sim(rec['name']['latin'], it['src'])
            pt = geo_point(rec)
            if pt is not None and it['g'].contains(pt):
                s += 0.25
            scored.append((s, i, code))
    scored.sort(reverse=True)
    used_i, used_c = set(), set()
    for s, i, code in scored:
        if s < 0.62 or i in used_i or code in used_c:
            continue
        items[i]['code'] = code
        used_i.add(i); used_c.add(code)
    n = 0
    for i, it in enumerate(items):
        pc = it['parent']['code']
        if 'code' in it:
            rec = pumi_tbl[it['code']]
            it['en'], it['km'] = rec['name']['latin'], rec['name']['km']
            it['unit_km'] = rec['administrative_unit']['km']
            it['unit_en'] = rec['administrative_unit'].get('en', '')
        else:
            n += 1
            it['code'] = f'{pc}x{i}'  # synthetic, keeps hierarchy prefix
            it['en'], it['km'] = it['src'], ''
            it['unit_km'], it['unit_en'] = '', ''
    print(label, len(items), 'unmatched', n)
    return items

dists = match(load('ADM2'), provs, Dd, 4, 'districts')
comms = match(load('ADM3'), dists, C, 6, 'communes')

for p in provs:
    p['unit_km'], p['unit_en'] = P[p['code']]['administrative_unit']['km'], P[p['code']]['administrative_unit'].get('en', 'Province')

def wiki(tbl, code):
    return ((tbl.get(code) or {}).get('links') or {}).get('wikipedia', '')

# ---- GeoJSON per level for tiling ----
def fc(items, level, tbl):
    feats = []
    for it in items:
        feats.append({'type': 'Feature', 'geometry': mapping(it['g']), 'properties': {
            'code': it['code'], 'level': level, 'name': it['en'], 'name_km': it['km'],
        }})
    return {'type': 'FeatureCollection', 'features': feats}

json.dump(fc(provs, 1, P), open(f'{OUT}/adm1.geojson', 'w'))
json.dump(fc(dists, 2, Dd), open(f'{OUT}/adm2.geojson', 'w'))
json.dump(fc(comms, 3, C), open(f'{OUT}/adm3.geojson', 'w'))

# ---- labels (one point per area) ----
from shapely.ops import polylabel
def label_pt(g):
    try:
        big = max(g.geoms, key=lambda x: x.area) if hasattr(g, 'geoms') else g
        return polylabel(big, tolerance=0.001)
    except Exception:
        return g.representative_point()

labels = []
for level, items in ((1, provs), (2, dists), (3, comms)):
    for it in items:
        pt = label_pt(it['g'])
        labels.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(pt.x, 5), round(pt.y, 5)]},
                       'properties': {'code': it['code'], 'level': level, 'name': it['en'], 'area': round(it['g'].area * 1e4)}})
json.dump({'type': 'FeatureCollection', 'features': labels}, open(f'{OUT}/labels.geojson', 'w'))

# ---- area index: names, hierarchy, bbox, centre, wiki, unit ----
def r(x):
    return round(x, 4)

areas = {}
for level, items, tbl in ((1, provs, P), (2, dists, Dd), (3, comms, C)):
    for it in items:
        b = it['g'].bounds
        pt = label_pt(it['g'])
        areas[it['code']] = [level, it['en'], it['km'], it['unit_en'], it['unit_km'], [r(b[0]), r(b[1]), r(b[2]), r(b[3])], [r(pt.x), r(pt.y)], wiki(tbl, it['code'])]

# villages: no public geometry; link to commune code by prefix
villages = [[code, rec['name']['latin'], rec['name']['km']] for code, rec in V.items()]
# pumi communes/districts without polygon (post-2014 changes): searchable, mapped to nearest known parent
extra = []
for tbl, lvl in ((Dd, 2), (C, 3)):
    for code, rec in tbl.items():
        if code not in areas:
            extra.append([code, lvl, rec['name']['latin'], rec['name']['km'], rec['administrative_unit'].get('en', ''), rec['administrative_unit']['km']])

json.dump({'areas': areas, 'villages': villages, 'extra': extra}, open(f'{OUT}/admin-index.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# ---- point-in-polygon lookup: simplified communes with full hierarchy ----
lookup = []
for it in comms:
    g = it['g'].simplify(0.0015, preserve_topology=True)
    polys = list(g.geoms) if hasattr(g, 'geoms') else [g]
    rings = []
    for pg in polys:
        if pg.geom_type != 'Polygon' or pg.is_empty:
            continue
        rings.append([[int(round(x * 1e4)), int(round(y * 1e4))] for x, y in pg.exterior.coords])
    b = it['g'].bounds
    lookup.append([it['code'], it['parent']['code'], it['parent']['parent']['code'], [r(b[0]), r(b[1]), r(b[2]), r(b[3])], rings])
json.dump(lookup, open(f'{OUT}/admin-lookup.json', 'w'), separators=(',', ':'))

stats = {'provinces': len(provs), 'districts': len(dists), 'communes': len(comms), 'villages': len(villages)}
json.dump(stats, open(f'{OUT}/stats.json', 'w'))
print(stats)
