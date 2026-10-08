"""(Estudo, NÃO usado no site: encher os encaixes das gotas dobra a malha. O site usa trocar_cabeca.py: o corpo do site com a
cabeça deste arquivo. Fica aqui porque lê o 3MF inteiro e põe corpo e cabeça no lugar do modelo montado.)

Borboletoscópio em 3D a partir do arquivo de impressão (06/10/2026: `BORBOLETA COMPLETO.3mf`, projeto do Bambu Studio que o Luiz
mandou). O 3MF traz a peça em partes para imprimir: o corpo (asas, antenas e o encaixe da cabeça), 12 cabeças com os olhos e as
sobrancelhas pintados no 2.º filamento, as gotas das asas e as bolinhas. O corpo e a cabeça guardam onde estavam no modelo montado
(`source_offset` em Metadata/model_settings.config), então a cabeça vai para o lugar dela no corpo. As gotas e as bolinhas foram
cortadas e arrumadas na placa (perderam a posição): no corpo ficam os encaixes delas, que levam a cor dos detalhes.

Partes (materiais): body (corpo: contorno, asas, antenas) e details (os encaixes das gotas e das bolinhas) são coloríveis; face
(a cabeça), eyes (olhos, sobrancelhas e o sorriso, pretos), cheeks (as bochechas, rosadas, como na peça) ficam fixos. O brilho
dos olhos (sem pintura no arquivo) fica na cor do rosto.

Uso: blender -b -P montar_3mf.py -- <pasta do 3MF descompactado> <saida.glb> [proporção de faces do corpo, 0.06]
Depois: tools/modelo-novidades/reduzir-comprimir.cjs (bordas das cores travadas + Meshopt) e o ?v= em dist/asset-models.js.
"""
import bpy, bmesh, os, re, sys, numpy as np
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = a[0], a[1]; RATIO = float(a[2]) if len(a) > 2 else .06
DEBUG = os.environ.get('BORB_DEBUG')

def settings():
    s = open(os.path.join(SRC, 'Metadata', 'model_settings.config'), encoding='utf8').read()
    objs = {}
    for oid, body in re.findall(r'<object id="(\d+)">([\s\S]*?)</object>', s):
        name = re.search(r'<metadata key="name" value="([^"]*)"', body).group(1)
        g = lambda k: (re.search(r'key="%s" value="([^"]*)"' % k, body) or [None, None])[1]
        objs[oid] = {'name': name, 'off': np.array([float(g('source_offset_%s' % c) or 0) for c in 'xyz'])}
    top = open(os.path.join(SRC, '3D', '3dmodel.model'), encoding='utf8').read()
    for oid in objs:
        m = re.search(r'<object id="%s"[^>]*>\s*<components>\s*<component p:path="([^"]+)" objectid="(\d+)"' % oid, top)
        if m: objs[oid]['path'] = os.path.join(SRC, m.group(1).lstrip('/'))
    return objs

def mesh_from(path):
    """vértices, triângulos e a pintura de cada triângulo ('' = sem pintura) de um objeto do 3MF (lido em bloco, rápido)"""
    t = open(path, encoding='utf8').read()
    vb = t[t.index('<vertices>'):t.index('</vertices>')]
    V = np.fromstring(vb.replace('<vertices>', ' ').replace('<vertex x="', ' ').replace('" y="', ' ').replace('" z="', ' ').replace('"/>', ' '), sep=' ').reshape(-1, 3)
    tb = t[t.index('<triangles>'):t.index('</triangles>')]
    paint = re.findall(r'<triangle v1="\d+" v2="\d+" v3="\d+"(?: paint_color="([^"]*)")?', tb)
    F = np.fromstring(re.sub(r'\s*paint_color="[^"]*"', '', tb).replace('<triangles>', ' ').replace('<triangle v1="', ' ').replace('" v2="', ' ').replace('" v3="', ' ').replace('"/>', ' '), dtype=np.int64, sep=' ').reshape(-1, 3)
    assert len(paint) == len(F), (len(paint), len(F))
    return V, F, np.array(paint)

objs = settings()
body_id = next(k for k, o in objs.items() if o['name'].startswith('butterfly_body'))
head_id = next(k for k, o in objs.items() if o['name'].startswith('butterfly_Head'))
Vb, Fb, _ = mesh_from(objs[body_id]['path']); Vh, Fh, Ph = mesh_from(objs[head_id]['path'])
Vb = Vb + objs[body_id]['off']; Vh = Vh + objs[head_id]['off']          # as duas no lugar do modelo montado
print('CORPO', len(Fb), 'faces; CABEÇA', len(Fh), 'faces, pintura', {k or '-': int((Ph == k).sum()) for k in set(Ph.tolist())}, flush=True)
print('CAIXAS corpo', Vb.min(0).round(1), Vb.max(0).round(1), 'cabeça', Vh.min(0).round(1), Vh.max(0).round(1), flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
def make(name, V, F):
    me = bpy.data.meshes.new(name); me.vertices.add(len(V)); me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel().astype(np.int32))
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', (np.arange(len(F)) * 3).astype(np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.update(calc_edges=True); me.validate()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob
body = make('corpo', Vb, Fb); head = make('cabeca', Vh, Fh)
if DEBUG: print('MALHAS prontas', flush=True)

# ── o corpo com menos faces (4,4 milhões é a resolução de impressão); a cabeça fica inteira ──
bpy.context.view_layer.objects.active = body
m = body.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = RATIO; m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=m.name)
me = body.data; nf = len(me.polygons)
print('CORPO reduzido para', nf, 'faces', flush=True)

def face_data(me):
    n = len(me.polygons); C = np.zeros(n * 3); N = np.zeros(n * 3); A = np.zeros(n)
    me.polygons.foreach_get('center', C); me.polygons.foreach_get('normal', N); me.polygons.foreach_get('area', A)
    return C.reshape(-1, 3), N.reshape(-1, 3), A
def relief(me, N_IT=150):
    """altura de cada face sobre a própria superfície alisada (o encaixe fica abaixo dela)"""
    V = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3); nv = len(V)
    E = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    deg = np.maximum(np.bincount(E.ravel(), minlength=nv), 1).astype(float)
    avg = lambda X: np.stack([np.bincount(E[:, 0], X[E[:, 1], k], nv) + np.bincount(E[:, 1], X[E[:, 0], k], nv) for k in range(3)], 1) / deg[:, None]
    Vs = V.copy()
    for it in range(N_IT): Vs = Vs + .5 * (avg(Vs) - Vs)
    Nv = np.zeros(nv * 3); me.vertices.foreach_get('normal', Nv); Nv = Nv.reshape(-1, 3)
    det = np.einsum('ij,ij->i', V - Vs, Nv)
    Fv = np.zeros(len(me.polygons) * 3, int); me.polygons.foreach_get('vertices', Fv)
    return det[Fv.reshape(-1, 3)].mean(1)
C, N, A = face_data(me); hf = relief(me)
if DEBUG:
    for zone, m_ in (('frente', N[:, 1] < -.8), ('trás', N[:, 1] > .8), ('lado', np.abs(N[:, 1]) < .3)):
        print('ALTURA %s: p1/p5/p25/p50/p75/p95 %s' % (zone, np.round(np.percentile(hf[m_], [1, 5, 25, 50, 75, 95]), 3)), flush=True)

def pairs_of(me):
    bm = bmesh.new(); bm.from_mesh(me)
    P = np.array([(e.link_faces[0].index, e.link_faces[1].index) for e in bm.edges if len(e.link_faces) == 2], np.int64); bm.free(); return P
def components(mask, P):
    parent = np.arange(len(mask))
    def find(i):
        r = i
        while parent[r] != r: r = parent[r]
        while parent[i] != r: parent[i], i = r, parent[i]
        return r
    for f, g in P[mask[P[:, 0]] & mask[P[:, 1]]]:
        rf, rg = find(f), find(g)
        if rf != rg: parent[max(rf, rg)] = min(rf, rg)
    idx = np.where(mask)[0]; roots = np.array([find(i) for i in idx])
    return idx, roots

# ── os encaixes das gotas e das bolinhas: o fundo (virado para a frente ou para trás, abaixo da superfície) e as paredes em volta ──
Pb = pairs_of(me)
floor = (np.abs(N[:, 1]) > .6) & (hf < -.8)
details = floor.copy()
for it in range(6):
    a_, b_ = Pb[:, 0], Pb[:, 1]
    grow = np.concatenate([b_[details[a_] & ~details[b_] & (hf[b_] < -.25)], a_[details[b_] & ~details[a_] & (hf[a_] < -.25)]])
    if not len(grow): break
    details[grow] = True
# o encaixe redondo da cabeça (atrás dela) é do corpo, não um detalhe das asas
lo_h, hi_h = Vh.min(0), Vh.max(0)
socket = (C[:, 0] > lo_h[0] - 1.5) & (C[:, 0] < hi_h[0] + 1.5) & (C[:, 2] > lo_h[2] - 1.5) & (C[:, 2] < hi_h[2] + 1.5)
details &= ~socket
idx, roots = components(details, Pb)
ids, cnt = np.unique(roots, return_counts=True)
print('ENCAIXES', len(ids), 'regiões;', int(details.sum()), 'faces; maiores', sorted(cnt.tolist())[-8:], flush=True)
# Encher os encaixes: na peça montada, a gota e a bolinha (impressas à parte, na cor dos detalhes) entram coladas neles. O fundo de
# cada encaixe sobe até rente à asa, 0,35 mm acima dela (a borda da asa em volta não se mexe): no 3D, a gota fica onde a peça a mostra.
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
filled = 0
for r in ids:
    faces = idx[roots == r]; fset = set(faces.tolist())
    vs = {v.index for i in faces for v in bm.faces[i].verts}
    rim = [vi for vi in vs if any(f.index not in fset for f in bm.verts[vi].link_faces)]
    inner = [vi for vi in vs if vi not in set(rim)]
    if not rim or not inner: continue
    s = -1.0 if (N[faces, 1] * A[faces]).sum() < 0 else 1.0          # para fora: -y na frente, +y atrás
    y_rim = float(np.median([bm.verts[vi].co.y for vi in rim]))
    for vi in inner: bm.verts[vi].co.y = y_rim + s * .35
    filled += 1
bm.to_mesh(me); bm.free(); me.update()
print('ENCAIXES cheios', filled, flush=True)

# ── a cabeça: olhos e sobrancelhas (pintados no arquivo); o sorriso e as bochechas pelo relevo do rosto ──
hm = head.data; Ch, Nh, Ah = face_data(hm); hh = relief(hm, 60); Phd = pairs_of(hm)
painted = Ph != ''
raised = ~painted & (hh > .12) & (Nh[:, 1] < -.2)
hidx, hroots = components(raised, Phd); hids, hcnt = np.unique(hroots, return_counts=True)
for j in np.argsort(-hcnt)[:8]:
    sel = hidx[hroots == hids[j]]; c = Ch[sel].mean(0); ext = Ch[sel].max(0) - Ch[sel].min(0)
    print('RELEVO ROSTO %5d faces centro (%.1f %.1f %.1f) tamanho (%.1f %.1f %.1f)' % (hcnt[j], *c, *ext), flush=True)

front = Nh[:, 1] < -.2
x, z = Ch[:, 0], Ch[:, 2]
cheeks = ~painted & front & (np.abs(x) > 6.4) & (np.abs(x) < 10.5) & (z > 77) & (z < 81.2) & (hh > .04)
smile = ~painted & front & (np.abs(x) < 5.4) & (z > 76.6) & (z < 81) & (hh > .04)
print('ROSTO olhos e sobrancelhas %d faces, sorriso %d, bochechas %d' % (int(painted.sum()), int(smile.sum()), int(cheeks.sum())), flush=True)

# ── materiais: as cores da peça real (foto do Luiz: rosto creme, olhos e sorriso pretos, bochechas rosadas); o corpo e os detalhes
# chegam com as cores padrão da vitrine e o site pinta por cima ──
def lin(h): c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]); return tuple(np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)) + (1,)
COLORS = {'body': ('#8fd3bf', .45), 'details': ('#f4cf4f', .45), 'face': ('#f2d8ad', .42), 'eyes': ('#1d1a1d', .28), 'cheeks': ('#f08b9c', .42)}
mats = {}
for name, (hexc, rough) in COLORS.items():
    mt = bpy.data.materials.new(name); mt.use_nodes = True; bs = mt.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = lin(hexc); bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = 0; mats[name] = mt
me.materials.clear(); me.materials.append(mats['body']); me.materials.append(mats['details'])
me.polygons.foreach_set('material_index', details.astype(np.int32)); me.update()
hm.materials.clear()
for n in ('face', 'eyes', 'cheeks'): hm.materials.append(mats[n])
hcls = np.zeros(len(hm.polygons), np.int32); hcls[painted | smile] = 1; hcls[cheeks] = 2
hm.polygons.foreach_set('material_index', hcls); hm.update()
for ob in (body, head):
    for p in ob.data.polygons: p.use_smooth = True
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.shade_smooth_by_angle(angle=np.radians(35)); ob.select_set(False)
for ob in (body, head): ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_materials='EXPORT', export_normals=True)
print('SAIDA', DST, os.path.getsize(DST), 'bytes', flush=True)
