"""Borboletoscópio: o corpo e as gotas do modelo do site com a cabeça do arquivo de impressão (06/10/2026, pedido do Luiz: "lapidar
rosto da borboleta no 3D; ver se consegue melhorar as cores"). A cabeça vem de `BORBOLETA COMPLETO.3mf` (Bambu Studio): a forma
exata da peça impressa, com os olhos e as sobrancelhas pintados no 2.º filamento; o sorriso e as bochechas são relevo, e ganham as
cores da peça real (foto do Luiz): sorriso preto, bochechas rosadas, rosto creme. O brilho de cada olho (sem pintura) fica creme.
(Montar a peça inteira do 3MF, tools/modelo-borboleta/montar_3mf.py, deixa as gotas das asas como encaixes vazios: elas são
impressas à parte, e ao enchê-los a malha dobra. O corpo do site, com as gotas em relevo, fica.)

A cabeça antiga (materiais face e eyes) sai; a nova entra no centro dela, com a mesma largura (escala uniforme), virada para a frente.
Materiais: body e details (do modelo do site, coloríveis), face, eyes (olhos, sobrancelhas e sorriso) e cheeks (bochechas).

Uso: blender -b -P trocar_cabeca.py -- <modelo do site, sem Meshopt> <pasta do 3MF descompactado> <saida.glb>
"""
import bpy, bmesh, os, re, sys, numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--') + 1:]
OLD, SRC, DST = a

def head_mesh():
    s = open(os.path.join(SRC, 'Metadata', 'model_settings.config'), encoding='utf8').read()
    oid = next(o for o, b in re.findall(r'<object id="(\d+)">([\s\S]*?)</object>', s) if 'butterfly_Head' in b)
    top = open(os.path.join(SRC, '3D', '3dmodel.model'), encoding='utf8').read()
    path = os.path.join(SRC, re.search(r'<object id="%s"[^>]*>\s*<components>\s*<component p:path="([^"]+)"' % oid, top).group(1).lstrip('/'))
    t = open(path, encoding='utf8').read()
    vb = t[t.index('<vertices>'):t.index('</vertices>')]
    V = np.fromstring(vb.replace('<vertices>', ' ').replace('<vertex x="', ' ').replace('" y="', ' ').replace('" z="', ' ').replace('"/>', ' '), sep=' ').reshape(-1, 3)
    tb = t[t.index('<triangles>'):t.index('</triangles>')]
    paint = np.array(re.findall(r'<triangle v1="\d+" v2="\d+" v3="\d+"(?: paint_color="([^"]*)")?', tb))
    F = np.fromstring(re.sub(r'\s*paint_color="[^"]*"', '', tb).replace('<triangles>', ' ').replace('<triangle v1="', ' ').replace('" v2="', ' ').replace('" v3="', ' ').replace('"/>', ' '), dtype=np.int64, sep=' ').reshape(-1, 3)
    return V, F, paint

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OLD)
old = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
bpy.ops.object.select_all(action='DESELECT'); old.select_set(True); bpy.context.view_layer.objects.active = old
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = old.data
names = [m.name.split('.')[0] for m in me.materials]
mi = np.zeros(len(me.polygons), int); me.polygons.foreach_get('material_index', mi)
oldhead = np.isin(mi, [names.index('face'), names.index('eyes')])
Co = np.zeros(len(me.polygons) * 3); me.polygons.foreach_get('center', Co); Co = Co.reshape(-1, 3)
lo, hi = Co[oldhead].min(0), Co[oldhead].max(0); ctr = (lo + hi) / 2
print('CABEÇA ANTIGA', int(oldhead.sum()), 'faces; caixa', lo.round(3), hi.round(3), flush=True)
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.where(oldhead)[0]], context='FACES')
bm.to_mesh(me); bm.free(); me.update()

# a cabeça nova: centrada na antiga, com a mesma largura; a frente dela (-y) para a frente do modelo (-y)
V, F, P = head_mesh()
hl, hh_ = V.min(0), V.max(0); s = (hi[0] - lo[0]) / (hh_[0] - hl[0])
Vn = (V - (hl + hh_) / 2) * s
# encosta a parte de trás da cabeça onde estava a de trás da antiga (a frente fica à frente do rosto antigo, como a peça)
Vn[:, 1] += hi[1] - Vn[:, 1].max(); Vn[:, 0] += ctr[0]; Vn[:, 2] += ctr[2]
print('CABEÇA NOVA escala %.5f; caixa %s .. %s' % (s, Vn.min(0).round(3), Vn.max(0).round(3)), flush=True)
hm = bpy.data.meshes.new('cabeca'); hm.vertices.add(len(Vn)); hm.vertices.foreach_set('co', Vn.astype(np.float32).ravel())
hm.loops.add(F.size); hm.loops.foreach_set('vertex_index', F.ravel().astype(np.int32))
hm.polygons.add(len(F)); hm.polygons.foreach_set('loop_start', (np.arange(len(F)) * 3).astype(np.int32)); hm.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
hm.update(calc_edges=True); hm.validate()
head = bpy.data.objects.new('cabeca', hm); bpy.context.scene.collection.objects.link(head)

# relevo do rosto: o sorriso (o arco no meio, abaixo dos olhos) e as bochechas (os dois ovais dos lados), em coordenadas da peça (mm)
n = len(hm.polygons); Ch = np.zeros(n * 3); Nh = np.zeros(n * 3); hm.polygons.foreach_get('center', Ch); hm.polygons.foreach_get('normal', Nh)
Ch = Ch.reshape(-1, 3) / s; Nh = Nh.reshape(-1, 3)
Vv = np.zeros(len(hm.vertices) * 3); hm.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3); nv = len(Vv)
E = np.zeros(len(hm.edges) * 2, int); hm.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
deg = np.maximum(np.bincount(E.ravel(), minlength=nv), 1).astype(float)
avg = lambda X: np.stack([np.bincount(E[:, 0], X[E[:, 1], k], nv) + np.bincount(E[:, 1], X[E[:, 0], k], nv) for k in range(3)], 1) / deg[:, None]
Vs = Vv.copy()
for it in range(60): Vs = Vs + .5 * (avg(Vs) - Vs)
Nv = np.zeros(nv * 3); hm.vertices.foreach_get('normal', Nv); Nv = Nv.reshape(-1, 3)
det = np.einsum('ij,ij->i', Vv - Vs, Nv) / s
Fv = np.zeros(n * 3, int); hm.polygons.foreach_get('vertices', Fv); hrel = det[Fv.reshape(-1, 3)].mean(1)
x = Ch[:, 0] - ctr[0] / s; z = Ch[:, 2] - ctr[2] / s          # em mm, a partir do centro da cabeça
painted = P != ''; front = Nh[:, 1] < -.2
bmh = bmesh.new(); bmh.from_mesh(hm)
Ph2 = np.array([(e.link_faces[0].index, e.link_faces[1].index) for e in bmh.edges if len(e.link_faces) == 2], np.int64); bmh.free()
def parts(mask):
    """as regiões ligadas de uma máscara de faces: [índices das faces de cada uma], da maior para a menor"""
    parent = np.arange(n)
    def find(i):
        r = i
        while parent[r] != r: r = parent[r]
        while parent[i] != r: parent[i], i = r, parent[i]
        return r
    for f, g in Ph2[mask[Ph2[:, 0]] & mask[Ph2[:, 1]]]:
        rf, rg = find(f), find(g)
        if rf != rg: parent[max(rf, rg)] = min(rf, rg)
    idx = np.where(mask)[0]; roots = np.array([find(i) for i in idx])
    return sorted((idx[roots == r] for r in np.unique(roots)), key=len, reverse=True)
# o sorriso: só o arco (as regiões grandes do relevo no meio, abaixo dos olhos; um pontinho solto não entra)
smile = np.zeros(n, bool)
for p in parts(~painted & front & (np.abs(x) < 5.6) & (z > -8.8) & (z < -3.6) & (hrel > .12)):
    if len(p) >= 200: smile[p] = True
# as bochechas: um oval liso em volta do relevo de cada uma (a mancha da textura saía quadrada), um pouco maior que ele
cheeks = np.zeros(n, bool)
for side in (-1, 1):
    zone = ~painted & front & (side * x > 5.8) & (side * x < 11) & (z > -7.8) & (z < -3.2) & (hrel > .12)
    ps = parts(zone)
    if not ps: continue
    p = ps[0]; cxz = np.array([x[p].mean(), z[p].mean()]); rx = max(np.ptp(x[p]) / 2 * 1.3, 1.9); rz = max(np.ptp(z[p]) / 2 * 1.3, 1.4)
    cheeks |= ~painted & ~smile & front & (((x - cxz[0]) / rx) ** 2 + ((z - cxz[1]) / rz) ** 2 < 1)
    print('BOCHECHA centro (%.1f, %.1f) mm, raios %.1f x %.1f mm' % (*cxz, rx, rz), flush=True)
print('ROSTO olhos e sobrancelhas %d, sorriso %d, bochechas %d faces' % (int(painted.sum()), int(smile.sum()), int(cheeks.sum())), flush=True)

def lin(h): c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]); return tuple(np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)) + (1,)
def mat(name, hexc, rough):
    mt = bpy.data.materials.get(name) or bpy.data.materials.new(name); mt.use_nodes = True; bs = mt.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = lin(hexc); bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = 0; return mt
hm.materials.append(mat('face', '#f4d6a6', .42)); hm.materials.append(mat('eyes', '#1d1a1d', .28)); hm.materials.append(mat('cheeks', '#f08b9c', .42))
cls = np.zeros(n, np.int32); cls[painted | smile] = 1; cls[cheeks] = 2
hm.polygons.foreach_set('material_index', cls); hm.update()
for p in hm.polygons: p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT'); head.select_set(True); bpy.context.view_layer.objects.active = head
bpy.ops.object.shade_smooth_by_angle(angle=np.radians(35))
old.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_materials='EXPORT', export_normals=True)
print('SAIDA', DST, os.path.getsize(DST), 'bytes', flush=True)
