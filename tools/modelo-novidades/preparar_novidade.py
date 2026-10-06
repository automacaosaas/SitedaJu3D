"""GiraffeLamp e UnicornLamp em 3D SEM textura (06/10/2026), como o macaco: a cor de cada face vem da textura do Rodin, classificada
em poucos materiais lisos com as cores fixas da peça. Nenhum se chama body/details/engines, então nada fica colorível no site, e sem
textura o site não precisa buscar imagens por blob: (a CSP bloqueia isso em connect-src).

- Por dentro, liso: o Rodin projetou as manchas da girafa (e um cinza-escuro sujo, no unicórnio) na parede de dentro do tubo. Tudo o
  que está dentro do tubo fica na cor do corpo.
- Unicórnio: as estrelas do Rodin saíram tortas (pontas quebradas, amassadas, duas grudadas nas nuvens). Cada uma é trocada por uma
  estrela de 5 pontas regular, no mesmo lugar, do mesmo tamanho e na mesma direção, com a borda arredondada, assentada no tubo.
- Contornos das cores: decididos na malha inteira do Rodin (500 mil triângulos); a redução de faces depois não mexe nas bordas entre
  cores (vértices da borda protegidos).

Fontes: `rodin-v2_-0 (10).glb` (girafa) e `rodin-v2_-0 (11).glb` (unicórnio), recebidas em 06/10/2026.
Uso: blender -b -P preparar_novidade.py -- <girafa|unicornio> <rodin.glb> <saida.glb> [proporção de faces, 0.5]
Depois: a compressão Meshopt de sempre (PERFORMANCE-QA.md) e o ?v= em dist/asset-models.js.
"""
import bpy, bmesh, os, sys, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index('--') + 1:]
KIND, src, dst = a[0], os.path.abspath(a[1]), os.path.abspath(a[2]); RATIO = float(a[3]) if len(a) > 3 else .5
DEBUG = os.environ.get('NOVIDADE_DEBUG')

# Materiais (sRGB, rugosidade). As cores são as da própria textura, limpas (a mediana de cada cor, sem a sombra pintada).
MATERIAIS = {
    'girafa': [('coat', (238, 176, 18), .45), ('spots', (96, 52, 30), .45), ('muzzle', (222, 196, 160), .45), ('features', (30, 25, 25), .3)],
    'unicornio': [('coat', (240, 236, 232), .42), ('purple', (166, 92, 190), .4), ('blue', (124, 138, 216), .4), ('horn', (214, 168, 44), .32),
                  ('features', (34, 32, 38), .3)],
}[KIND]
NAMES = [m[0] for m in MATERIAIS]; K = len(NAMES); COAT = 0
SMOOTH, ISLAND, FEATURE_MIN = 4, 250, 60

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH'); obj.name = {'girafa': 'girafoscopio', 'unicornio': 'unicornioscopio'}[KIND]
me = obj.data; nf = len(me.polygons)
# o importador separa os vértices nas costuras da UV; solda de volta para a malha ser contínua (a UV fica nos cantos das faces)
bm = bmesh.new(); bm.from_mesh(me); n0 = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); bm.to_mesh(me); bm.free()
print('SOLDA', n0, '->', len(me.vertices), 'vértices;', nf, 'faces', flush=True)

def face_data(me):
    n = len(me.polygons)
    C = np.zeros(n * 3); me.polygons.foreach_get('center', C)
    N = np.zeros(n * 3); me.polygons.foreach_get('normal', N)
    A = np.zeros(n); me.polygons.foreach_get('area', A)
    return C.reshape(-1, 3), N.reshape(-1, 3), A
C, N, A = face_data(me)
lo, hi = C.min(0), C.max(0); AX = (lo + hi) / 2; H = hi[2] - lo[2]

# ── o oco do tubo e o eixo dele ──
# Uma face de dentro olha para o oco: o raio que sai dela atravessa o tubo e bate na parede do outro lado (longe). O eixo (vertical)
# é o centro do círculo que passa por essas faces em cada altura (o centro da caixa da peça não serve: o chifre, a crina e as
# orelhas o deslocam).
bm = bmesh.new(); bm.from_mesh(me); tree = BVHTree.FromBMesh(bm); bm.free()
far = np.zeros(nf, bool)
for i in range(nf):
    c = Vector(C[i]); n = Vector(N[i])
    hit = tree.ray_cast(c + n * 2e-4, n, 1.5)
    if hit[0] is not None and hit[3] > .18: far[i] = True
bins = np.clip(((C[:, 2] - lo[2]) / H * 60).astype(int), 0, 59)
centers = []
for b in range(60):
    p = C[far & (bins == b) & (np.abs(N[:, 2]) < .3)]
    if len(p) < 200: continue
    M_ = np.column_stack([p[:, 0], p[:, 1], np.ones(len(p))]); D, E, F = np.linalg.lstsq(M_, -(p[:, 0] ** 2 + p[:, 1] ** 2), rcond=None)[0]
    centers.append((-D / 2, -E / 2))
AX = np.array([*np.median(np.array(centers), 0), AX[2]])
print('EIXO (%.4f, %.4f) em %d alturas, espalhamento %.4f' % (AX[0], AX[1], len(centers), np.array(centers).std(0).max()), flush=True)

# ── cor da textura: 4 amostras por face (centro e três pontos a 1/3 do caminho até cada vértice), em HSV ──
im = next(i for i in bpy.data.images if i.name.startswith('texture_diffuse'))
w, h = im.size; px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
uv = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
ls = np.zeros(nf, np.int32); me.polygons.foreach_get('loop_start', ls)
c0, c1, c2 = uv[ls], uv[ls + 1], uv[ls + 2]; cen = (c0 + c1 + c2) / 3
def at(p):
    x = np.clip((p[:, 0] % 1) * w, 0, w - 1).astype(int); y = np.clip((p[:, 1] % 1) * h, 0, h - 1).astype(int); return px[y, x]
def hsv(rgb):
    mx = rgb.max(1); mn = rgb.min(1); d = np.maximum(mx - mn, 1e-6); r, g, b = rgb.T
    hh = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return hh, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx

# o rosto: na frente (-Y no Blender), na altura da cabeça. Só ali há traços pretos (olhos, narinas, boca, cílios).
r_ = np.hypot(C[:, 0] - AX[0], C[:, 1] - AX[1])
HEAD_Z = {'girafa': lo[2] + .62 * H, 'unicornio': lo[2] + .58 * H}[KIND]
FACE_HALF = {'girafa': .23, 'unicornio': .3}[KIND]       # meia largura do rosto (sem as manchas das bochechas da girafa)
face_zone = (C[:, 2] > HEAD_Z) & (C[:, 1] < AX[1]) & (np.abs(C[:, 0] - AX[0]) < FACE_HALF)
head = C[:, 2] > HEAD_Z - .12

def classify(rgb, zone, head):
    hh, s, v = hsv(rgb); k = np.full(len(rgb), COAT, np.int8)
    if KIND == 'girafa':
        k[(v < .52) & (s > .35) & ((hh < 42) | (hh > 340))] = 1          # manchas: marrom
        k[head & (s < .5) & (v > .5) & (hh < 50)] = 2                  # focinho e miolo das orelhas: bege (no corpo, é reflexo)
        k[zone & (v < .24)] = 3                                         # olhos, narinas e boca: preto
    else:
        k[(s > .22) & (hh >= 262) & (hh < 345) & (v > .18)] = 1        # roxo
        k[(s > .22) & (hh >= 200) & (hh < 262) & (v > .25)] = 2        # azul-lavanda (crina, orelhas)
        k[(s > .42) & (hh >= 30) & (hh < 68) & (v > .25)] = 3          # chifre dourado
        k[zone & (v < .3) & (s < .35)] = 4                              # olhos fechados, cílios, narinas: preto
    return k
votes = np.zeros((nf, K), np.int32)
for p in (cen, (2 * cen + c0) / 3, (2 * cen + c1) / 3, (2 * cen + c2) / 3):
    votes[np.arange(nf), classify(at(p), face_zone, head)] += 1
cls = votes.argmax(1).astype(np.int64)
print('TEXTURA', {NAMES[i]: int((cls == i).sum()) for i in range(K)}, flush=True)

# ── por dentro do tubo: na cor do corpo ──
# As faces que olham para o oco (acima); onde a parede tem a abertura (as costas da girafa) o raio escapa, então vale também: virada
# para o eixo e no raio de dentro naquela altura.
radial = np.stack([C[:, 0] - AX[0], C[:, 1] - AX[1]], 1) / np.maximum(r_, 1e-9)[:, None]
toward = np.einsum('ij,ij->i', N[:, :2], radial)
rin = np.full(60, np.nan)
for b in range(60):
    m = far & (bins == b) & (toward < -.7)
    if m.sum() > 20: rin[b] = np.median(r_[m])
ok = ~np.isnan(rin); rin = np.interp(np.arange(60), np.where(ok)[0], rin[ok])
inner = far | ((toward < -.6) & (r_ < rin[bins] + .004))
# as bordas de cima e de baixo (o aro) ficam na cor do corpo; embaixo, na cor da faixa de baixo por fora (o unicórnio tem a faixa roxa)
top_rim = (N[:, 2] > .8) & (C[:, 2] > hi[2] - .08) & (r_ < rin[bins] + .03)
bot_rim = (N[:, 2] < -.8) & (C[:, 2] < lo[2] + .03)
cls[inner | top_rim] = COAT
band = (~inner) & (C[:, 2] < lo[2] + .06) & (toward > .5)
cls[bot_rim] = np.bincount(cls[band], minlength=K).argmax() if band.any() else COAT
print('DENTRO', int(inner.sum()), 'faces (%.0f%% da área) na cor do corpo; aro de cima %d, de baixo %d (%s)' % (100 * A[inner].sum() / A.sum(), int(top_rim.sum()), int(bot_rim.sum()), NAMES[cls[bot_rim][0]] if bot_rim.any() else '-'), flush=True)

# ── limpeza: bordas alisadas pela maioria dos vizinhos e ilhas pequenas na cor que as cerca ──
bm = bmesh.new(); bm.from_mesh(me)
ed2 = [e for e in bm.edges if len(e.link_faces) == 2]
pairs = np.array([(e.link_faces[0].index, e.link_faces[1].index) for e in ed2], np.int64)
angs = np.array([e.calc_face_angle_signed() for e in ed2]); del ed2
bm.free()
nb = np.full((nf, 3), -1, np.int64); cnt = np.zeros(nf, np.int64)
for f, g in np.concatenate([pairs, pairs[:, ::-1]]):
    if cnt[f] < 3: nb[f, cnt[f]] = g; cnt[f] += 1
FEAT = K - 1
for it in range(SMOOTH):
    c = np.where(nb >= 0, cls[nb], -1); x, y, z = c.T
    k = np.where((x == y) & (x >= 0), x, np.where((x == z) & (x >= 0), x, np.where((y == z) & (y >= 0), y, -1)))
    ch = (k >= 0) & (k != cls) & ~inner; cls[ch] = k[ch]
def components(cls):
    parent = np.arange(nf)
    def find(i):
        r = i
        while parent[r] != r: r = parent[r]
        while parent[i] != r: parent[i], i = r, parent[i]
        return r
    for f, g in pairs[cls[pairs[:, 0]] == cls[pairs[:, 1]]]:
        rf, rg = find(f), find(g)
        if rf != rg: parent[max(rf, rg)] = min(rf, rg)
    return np.array([find(i) for i in range(nf)])
for rnd in range(4):
    root = components(cls); ids, inv, size = np.unique(root, return_inverse=True, return_counts=True)
    diff = pairs[cls[pairs[:, 0]] != cls[pairs[:, 1]]]; border = {}
    for f, g in np.concatenate([diff, diff[:, ::-1]]):
        d = border.setdefault(inv[f], np.zeros(K, np.int64)); d[cls[g]] += 1
    changed = 0
    for comp in np.where(size < ISLAND)[0]:
        b = border.get(comp)
        if b is None: continue
        kk = cls[ids[comp]]
        if kk == FEAT and size[comp] >= FEATURE_MIN: continue          # olho, narina: pequeno mas de verdade
        m = inv == comp; cls[m] = int(b.argmax()); changed += int(size[comp])
    print('ILHAS', rnd, 'componentes', len(ids), 'faces trocadas', changed, flush=True)
    if not changed: break
# Ilhas cercadas: os reflexos e riscos claros pintados dentro do chifre, da crina e do arco-íris (e dentro de uma mancha) viram a cor
# em volta; o preto que encosta na crina ou no chifre (e, na girafa, numa mancha), e não no corpo, é a sombra deles. O preto cercado
# pelo focinho bege (narinas e sorriso da girafa) fica.
SHADOW_OF = [NAMES.index(n) for n in {'girafa': ['spots'], 'unicornio': ['purple', 'blue', 'horn']}[KIND]]
root = components(cls); ids, inv, size = np.unique(root, return_inverse=True, return_counts=True)
diff = pairs[cls[pairs[:, 0]] != cls[pairs[:, 1]]]; border = {}
for f, g in np.concatenate([diff, diff[:, ::-1]]):
    d = border.setdefault(inv[f], np.zeros(K, np.int64)); d[cls[g]] += 1
changed = 0
for comp in np.where(size < 6000)[0]:
    b = border.get(comp); kk = cls[ids[comp]]
    if b is None: continue
    j = int(b.argmax())
    if (kk == COAT and j not in (COAT, FEAT) and b[j] >= .9 * b.sum()) or (kk == FEAT and j in SHADOW_OF):
        cls[inv == comp] = j; changed += int(size[comp])
print('CERCADAS', changed, 'faces na cor em volta', flush=True)

# ── a cor segue o relevo ──
# A textura pinta a lateral de um relevo (o arco-íris, as bochechas, as manchas, os traços) com a cor do fundo, e o contorno sai com
# franja clara. Cada face tem a altura local dela (abaixo); a cor de um relevo se espalha pelas
# faces íngremes do mesmo relevo (a lateral; a superfície plana do tubo, com as ondinhas dele, não): acima da superfície e sem atravessar uma dobra côncava (o pé do relevo no tubo, ou uma nuvem por cima dele).
# altura local de cada face: quanto ela sobe acima da própria superfície alisada (150 passos de média dos vizinhos; o tubo do Rodin
# não é um círculo exato, então o raio não serve de chão)
Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3); nv = len(Vv)
Ev = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', Ev); Ev = Ev.reshape(-1, 2)
deg = np.maximum(np.bincount(Ev.ravel(), minlength=nv), 1).astype(float)
avg = lambda X: np.stack([np.bincount(Ev[:, 0], X[Ev[:, 1], k], nv) + np.bincount(Ev[:, 1], X[Ev[:, 0], k], nv) for k in range(3)], 1) / deg[:, None]
Vs = Vv.copy()
for it in range(150): Vs = Vs + .5 * (avg(Vs) - Vs)
Nv = np.zeros(nv * 3); me.vertices.foreach_get('normal', Nv); Nv = Nv.reshape(-1, 3)
det = np.einsum('ij,ij->i', Vv - Vs, Nv)
Fv = np.zeros(nf * 3, int); me.polygons.foreach_get('vertices', Fv); Fv = Fv.reshape(-1, 3)
hf = det[Fv].mean(1)
convex = angs > -np.radians(15)
plain = ~inner & (np.abs(N[:, 2]) < .5) & (toward > .97) & (cls == COAT)
HMIN = .003       # acima das ondinhas de camada de impressão do Rodin (1 a 3 milésimos), abaixo dos relevos (as estrelas têm 9)
print('TUBO liso: altura local p5/p50/p95 %.4f %.4f %.4f; relevo a partir de %.4f' % (*np.percentile(hf[plain], [5, 50, 95]), HMIN), flush=True)
# Os relevos brancos de verdade (nuvens, focinho, orelhas) não recebem cor: o topo deles (plano, quase paralelo à superfície alisada)
# depois de uma abertura (erosão e dilatação de 5 faces, que tira as franjas finas), mais 3 faces da lateral deles em volta. A lateral
# íngreme de um relevo colorido, que a textura pintou de branco, não entra; nem um pedaço branco pequeno.
Ns = np.cross(Vs[Fv[:, 1]] - Vs[Fv[:, 0]], Vs[Fv[:, 2]] - Vs[Fv[:, 0]]); Ns /= np.maximum(np.linalg.norm(Ns, axis=1), 1e-12)[:, None]
flat = np.einsum('ij,ij->i', N, Ns) > .85
nbr = [[] for _ in range(nf)]
for f, g in pairs: nbr[f].append(g); nbr[g].append(f)
nbr = np.array([(x + [x[0]] * 3)[:3] if x else [i] * 3 for i, x in enumerate(nbr)], np.int64)
whiterel = (cls == COAT) & ~inner & (hf > HMIN)
keep = whiterel & flat
for it in range(5): keep = keep & keep[nbr].all(1)
for it in range(5): keep = whiterel & flat & (keep | keep[nbr].any(1))
# só os grandes (nuvens, focinho, orelhas): um pedaço branco pequeno em cima de um relevo colorido é o risco da textura
parent = np.arange(nf)
def find_(i):
    r = i
    while parent[r] != r: r = parent[r]
    while parent[i] != r: parent[i], i = r, parent[i]
    return r
for f, g in pairs[keep[pairs[:, 0]] & keep[pairs[:, 1]]]:
    rf, rg = find_(f), find_(g)
    if rf != rg: parent[max(rf, rg)] = min(rf, rg)
kf = np.where(keep)[0]; kr = np.array([find_(i) for i in kf]); kid, kcnt = np.unique(kr, return_counts=True)
keep[kf[~np.isin(kr, kid[kcnt >= 1500])]] = False
for it in range(3): keep = whiterel & (keep | keep[nbr].any(1))
print('RELEVOS brancos protegidos', int(keep.sum()), 'faces; franjas', int((whiterel & ~keep).sum()), flush=True)
# Entalhes: o risco branco que a textura passou por cima do arco-íris deixa um dente na borda dele (e o mesmo acontece em volta de
# traços e manchas). Um fechamento na malha (a cor cresce N faces sobre o relevo e encolhe de volta) fecha só o que é mais estreito
# que 2N faces; os relevos brancos de verdade (acima) ficam de fora.
CLOSE = {'girafa': {'spots': 6, 'features': 3}, 'unicornio': {'purple': 6, 'features': 3, 'blue': 3}}[KIND]
for name, steps in CLOSE.items():
    k = NAMES.index(name); base = cls == k
    allowed = base | ((cls == COAT) & ~inner & (hf > HMIN) & ~keep)
    d = base.copy()
    for it in range(steps): d = allowed & (d | d[nbr].any(1))
    e = d.copy()
    for it in range(steps): e = e & e[nbr].all(1)
    fill = e & ~base; cls[fill] = k
    print('FECHAMENTO', name, int(fill.sum()), 'faces dos entalhes', flush=True)
# Maioria em volta: uma face branca (fora dos relevos brancos de verdade) com a maior parte da área em volta, num raio de 12
# milésimos, de uma cor só fica dessa cor. Fecha o risco branco que a textura passa por cima do arco-íris e alisa o contorno dele.
from mathutils import kdtree
MAJ = {'girafa': ['spots', 'muzzle'], 'unicornio': ['purple']}[KIND]
for name in MAJ:
    k = NAMES.index(name); tot = 0
    for rnd in range(3):
        col = cls == k; cand = np.where((cls == COAT) & ~inner & ~keep)[0]
        kd = kdtree.KDTree(int(col.sum()) + len(cand)); idx = np.concatenate([np.where(col)[0], cand])
        for j, i in enumerate(idx): kd.insert(C[i], j)
        kd.balance()
        flip = []
        ncol = int(col.sum())
        for i in cand:
            got = kd.find_range(C[i], .012)
            if len(got) < 8: continue
            js = np.array([g[1] for g in got]); w = A[idx[js]]
            frac = w[js < ncol].sum() / w.sum()
            if frac > .55: flip.append(i)
        cls[flip] = k; tot += len(flip)
        if not flip: break
    print('MAIORIA', name, tot, 'faces', flush=True)
# Fechamento no tubo desenrolado (unicórnio): o arco-íris (o grupo roxo grande da frente do corpo) vai para uma grade (ângulo x
# altura, 2 milésimos por ponto), passa por um fechamento com um disco de 24 milésimos e volta para as faces brancas de fora que caem
# no que fechou (menos os relevos brancos de verdade). Fecha o dente que o risco branco da textura deixa na borda dele (ali a lateral
# fica abaixo da superfície alisada, então a altura não serve); a abertura do arco, mais larga, fica. Só o arco-íris entra na grade:
# as estrelas e os braços não se emendam nele.
if KIND == 'unicornio':
    k = NAMES.index('purple'); thf = np.arctan2(C[:, 1] - AX[1], C[:, 0] - AX[0]); RB = float(np.median(r_[~inner]))
    body = ~inner & (C[:, 2] > lo[2] + .1) & (C[:, 2] < HEAD_Z - .1) & (np.einsum('ij,ij->i', N[:, :2], radial) > .3)
    gu = (RB * np.angle(np.exp(1j * (thf + np.pi / 2)))) ; gv = C[:, 2]; S_ = .002
    iu = np.round((gu - gu[body].min()) / S_).astype(int); iv = np.round((gv - gv[body].min()) / S_).astype(int)
    W_, H_ = iu[body].max() + 1, iv[body].max() + 1
    root = components(cls); ids, inv, size = np.unique(root, return_inverse=True, return_counts=True); best = None
    for j in np.where(size > 5000)[0]:
        m = inv == j
        if cls[ids[j]] != k or inner[ids[j]] or not (lo[2] + .25 < C[m, 2].mean() < HEAD_Z - .2): continue
        off = abs(np.angle(np.exp(1j * thf[m]).mean() * np.exp(1j * np.pi / 2)))      # média circular (o braço passa de 180 graus)
        if best is None or off < best[0]: best = (off, m)
    grid = np.zeros((H_, W_), bool); pm = body & best[1]; grid[iv[pm], iu[pm]] = True
    R_ = 12; yy, xx = np.mgrid[-R_:R_ + 1, -R_:R_ + 1]; disk = [(dy, dx) for dy, dx in zip(yy.ravel(), xx.ravel()) if dy * dy + dx * dx <= R_ * R_]
    def shift_or(g):
        out = np.zeros_like(g); P_ = np.pad(g, R_)
        for dy, dx in disk: out |= P_[R_ + dy:R_ + dy + g.shape[0], R_ + dx:R_ + dx + g.shape[1]]
        return out
    closed = ~shift_or(~shift_or(grid))
    fill = body & (cls == COAT) & ~keep & closed[np.clip(iv, 0, H_ - 1), np.clip(iu, 0, W_ - 1)]
    cls[fill] = k
    print('FECHAMENTO 2D roxo', int(fill.sum()), 'faces', flush=True)
# a lateral íngreme até o pé (a dobra côncava para a cor), e o topo plano bem acima do tubo (o risco branco da textura em cima do
# arco-íris). Cada cor cresce sobre as faces de certas cores: o preto dos olhos da girafa também sobre o bege (o crescente embaixo do
# olho); o bege do focinho só na frente do rosto (não sobe pela borda das orelhas).
up = (~flat & (hf > 0)) | (flat & (hf > .005))
snout = (C[:, 1] < AX[1]) & (np.abs(C[:, 0] - AX[0]) < FACE_HALF + .08)
# (passos: as manchas da girafa crescem pouco; com mais, andam pelas ondinhas do tubo e saem fiapos)
GROW = {'girafa': [('muzzle', [COAT], snout, 60), ('spots', [COAT], None, 6), ('features', [COAT, 2], None, 60)],
        'unicornio': [('purple', [COAT], None, 60), ('features', [COAT], None, 60), ('blue', [COAT], None, 60), ('horn', [COAT], None, 60)]}[KIND]
for name, into, where, steps in GROW:
    k = NAMES.index(name); P = pairs[convex]; tot = 0
    ok_ = up & ~inner & ~keep & (where if where is not None else True)
    for it in range(steps):
        a_, b_ = P[:, 0], P[:, 1]
        m1 = (cls[a_] == k) & np.isin(cls[b_], into) & ok_[b_]
        m2 = (cls[b_] == k) & np.isin(cls[a_], into) & ok_[a_]
        new = np.unique(np.concatenate([b_[m1], a_[m2]]))
        if not len(new): break
        cls[new] = k; tot += len(new)
    print('RELEVO', name, tot, 'faces da lateral na cor dele (%d passos)' % it, flush=True)
# Girafa, pela forma (a textura erra nas bordas):
# - o miolo das orelhas é a concha: a parte côncava da frente da orelha fica bege; a borda (convexa), amarela.
# - as manchas perdem os fiapos (uma abertura de 3 faces apaga o que for mais fino que 6 faces).
# - o focinho e as manchas descem pela lateral até o pé: uma face vizinha entra enquanto a superfície continua descendo (a altura
#   dela é menor que a do vizinho por onde chegou); na dobra a superfície volta a subir e a cor para.
if KIND == 'girafa':
    ear = (np.abs(C[:, 0] - AX[0]) > .36) & (C[:, 2] > HEAD_Z + .1) & ~inner
    dish = ear & (N[:, 1] < -.2) & (hf < -.002); rim = ear & (cls == 2) & (hf > .002)
    cls[dish] = 2; cls[rim] = COAT
    print('ORELHAS concha %d faces bege, borda %d amarela' % (int(dish.sum()), int(rim.sum())), flush=True)
    k = 1; base = cls == k; o = base.copy()
    for it in range(3): o = o & o[nbr].all(1)
    for it in range(3): o = base & (o | o[nbr].any(1))
    cls[base & ~o] = COAT
    print('MANCHAS sem fiapos:', int((base & ~o).sum()), 'faces', flush=True)
    for name, where in (('muzzle', snout), ('spots', None)):
        k = NAMES.index(name); reach = np.where(cls == k, hf, np.inf); tot = 0
        for it in range(15):
            a_, b_ = pairs[:, 0], pairs[:, 1]
            ok_ = (cls == COAT) & ~inner & ~keep & (where if where is not None else True)
            m1 = (cls[a_] == k) & ok_[b_] & (hf[b_] < reach[a_]); m2 = (cls[b_] == k) & ok_[a_] & (hf[a_] < reach[b_])
            new = np.concatenate([b_[m1], a_[m2]]); src = np.concatenate([a_[m1], b_[m2]])
            if not len(new): break
            cls[new] = k; reach[new] = hf[new]; tot += len(np.unique(new))
        print('PÉ', name, tot, 'faces até a dobra (%d passos)' % it, flush=True)
# Por fim, os pontinhos soltos que sobraram dos passos acima (menos de 80 faces) ficam na cor que os cerca; olho e narina ficam.
for rnd in range(3):
    root = components(cls); ids, inv, size = np.unique(root, return_inverse=True, return_counts=True)
    diff = pairs[cls[pairs[:, 0]] != cls[pairs[:, 1]]]; border = {}
    for f, g in np.concatenate([diff, diff[:, ::-1]]):
        d = border.setdefault(inv[f], np.zeros(K, np.int64)); d[cls[g]] += 1
    changed = 0
    for comp in np.where(size < 80)[0]:
        b = border.get(comp)
        if b is None or inner[ids[comp]] or (cls[ids[comp]] == FEAT and size[comp] >= FEATURE_MIN): continue
        cls[inv == comp] = int(b.argmax()); changed += int(size[comp])
    print('PONTINHOS', rnd, changed, 'faces', flush=True)
    if not changed: break

if DEBUG:
    root = components(cls); ids, inv, size = np.unique(root, return_inverse=True, return_counts=True)
    for j in np.argsort(-size)[:60]:
        m = inv == j; p = C[m]
        print('COMP %-8s %6d faces  centro (%.3f %.3f %.3f)  tam (%.3f %.3f %.3f)' % (NAMES[cls[ids[j]]], size[j], *p.mean(0), *(p.max(0) - p.min(0))), flush=True)

if os.environ.get("NOVIDADE_JANELA"):
    x0_, x1_, z0_, z1_ = [float(x) for x in os.environ["NOVIDADE_JANELA"].split(",")]
    w_ = (C[:, 0] > x0_) & (C[:, 0] < x1_) & (C[:, 2] > z0_) & (C[:, 2] < z1_) & (C[:, 1] < AX[1] - .1) & ~inner
    for kk in range(K):
        mm = w_ & (cls == kk)
        if mm.any(): print("JANELA %s %d faces z %.3f..%.3f hf med %.4f flat %.2f keep %.2f" % (NAMES[kk], mm.sum(), C[mm, 2].min(), C[mm, 2].max(), np.median(hf[mm]), flat[mm].mean(), keep[mm].mean()), flush=True)
    mm = w_ & (cls == COAT); zz = C[mm, 2]
    for zb in np.arange(z0_, z1_, .005): sel = mm & (C[:, 2] >= zb) & (C[:, 2] < zb + .005); print("JANELA z %.3f: %d brancas, hf %.4f, keep %d" % (zb, sel.sum(), np.median(hf[sel]) if sel.any() else 0, keep[sel].sum()), flush=True)
if os.environ.get("NOVIDADE_PONTO"):
    px_, pz_ = [float(x) for x in os.environ["NOVIDADE_PONTO"].split(",")]; hit_ = tree.ray_cast(Vector((px_, -2, pz_)), Vector((0, 1, 0)))
    p_ = np.array(hit_[0][:]); dd = np.linalg.norm(C - p_, axis=1); print("PONTO na superfície", p_.round(4), flush=True)
    for i in np.argsort(dd)[:25]: print("PONTO %.4f %s inner %s keep %s hf %.4f flat %s radial %.2f" % (dd[i], NAMES[cls[i]], inner[i], keep[i], hf[i], flat[i], toward[i]), flush=True)
# ── materiais ──
def lin(c): return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
me.materials.clear()
for name, srgb, rough in MATERIAIS:
    mat = bpy.data.materials.new(name); mat.use_nodes = True; bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*lin(np.array(srgb) / 255), 1); bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = 0
    me.materials.append(mat)
while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
for img in list(bpy.data.images): bpy.data.images.remove(img)

# ── estrelas do unicórnio ──
# As do Rodin saíram tortas: pontas quebradas, amassadas, e as das bordas grudadas nas nuvens. Cada estrela (as áreas roxas pequenas
# no corpo, entre a faixa de baixo e a cabeça; pedaços a menos de 10 cm um do outro são a mesma estrela) é medida no tubo: o centro, o
# tamanho (a ponta típica das cinco), a direção das pontas e a altura do relevo. O relevo antigo é assentado no tubo (fica liso, na
# cor do corpo) e no lugar entra uma estrela de 5 pontas regular, com as pontas e os vãos arredondados e a borda boleada, curvada
# junto com o tubo e com a base 1,5 mm para dentro dele (sem fresta).
STARS = []
def angle_of(x, y): return np.arctan2(y - AX[1], x - AX[0])
def wrap(t): return (t + np.pi) % (2 * np.pi) - np.pi
if KIND == 'unicornio':
    root = components(cls); ids, inv, size = np.unique(root, return_inverse=True, return_counts=True)
    band_top = np.percentile(C[(cls == 1) & (C[:, 2] < lo[2] + .1) & ~inner, 2], 99)
    cand = []
    for j in range(len(ids)):
        m = inv == j
        if cls[ids[j]] != 1 or inner[ids[j]] or size[j] < 150: continue
        p = C[m]; ext = p.max(0) - p.min(0)
        if band_top + .02 < p[:, 2].mean() < HEAD_Z - .1 and ext.max() < .16: cand.append(m)
    groups = []
    for m in cand:
        c = C[m].mean(0)
        for g_ in groups:
            if np.linalg.norm(C[g_].mean(0) - c) < .1: g_ |= m; break
        else: groups.append(m.copy())
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    V = np.array([v.co[:] for v in bm.verts]); Rv = np.hypot(V[:, 0] - AX[0], V[:, 1] - AX[1]); Tv = angle_of(V[:, 0], V[:, 1])
    # as nuvens: relevos brancos grandes (faces do corpo acima do tubo, ligadas sem atravessar dobra côncava)
    rel = keep.copy()
    parent = np.arange(nf)
    def find(i):
        r = i
        while parent[r] != r: r = parent[r]
        while parent[i] != r: parent[i], i = r, parent[i]
        return r
    for f, g in pairs[convex & rel[pairs[:, 0]] & rel[pairs[:, 1]]]:
        rf, rg = find(f), find(g)
        if rf != rg: parent[max(rf, rg)] = min(rf, rg)
    rr_ = np.array([find(i) for i in np.where(rel)[0]]); ids_, cnt_ = np.unique(rr_, return_counts=True)
    big = np.zeros(nf, bool); big[np.where(rel)[0][np.isin(rr_, ids_[cnt_ > 1500])]] = True
    print('NUVENS', int(big.sum()), 'faces em', int((cnt_ > 1500).sum()), 'relevos brancos grandes', flush=True)
    meas = []
    for m in groups:
        fidx = np.where(m)[0]; wa = A[fidx]
        cc = (C[fidx] * wa[:, None]).sum(0) / wa.sum(); th = angle_of(cc[0], cc[1]); zc = cc[2]
        # o tubo ali: as faces lisas de fora em volta (sem relevo: as mais baixas)
        dth = wrap(angle_of(C[:, 0], C[:, 1]) - th)
        near = (~inner) & (np.abs(dth) < .45) & (np.abs(C[:, 2] - zc) < .1) & ~m & (np.einsum('ij,ij->i', N[:, :2], radial) > .95)
        rb = float(np.percentile(r_[near], 25))
        sv = sorted({v.index for i in fidx for v in bm.faces[i].verts})
        u = rb * wrap(Tv[sv] - th); v_ = V[sv, 2] - zc
        # o centro: o meio da caixa das pontas (o centro de área puxa para os pedaços amassados)
        uc, vc = (u.min() + u.max()) / 2, (v_.min() + v_.max()) / 2; th += uc / rb; zc += vc; u -= uc; v_ -= vc
        d = np.hypot(u, v_); phi = np.arctan2(v_, u)
        z5 = (d ** 6 * np.exp(5j * phi)).sum(); phi0 = np.angle(z5) / 5                      # direção de uma ponta
        tips = [d[np.abs(wrap(phi - (phi0 + k * 2 * np.pi / 5))) < np.pi / 5].max(initial=0) for k in range(5)]
        hgt = float(np.clip(np.percentile(Rv[sv] - rb, 85), .006, .02))
        # o relevo antigo, assentado no tubo: tudo o que sobe do tubo até 12% além da ponta mais longa dele, menos a nuvem encostada
        win = (np.abs(V[:, 2] - zc) < d.max() * 1.15) & (np.abs(wrap(Tv - th)) * rb < d.max() * 1.15)
        cloudv = {v.index for i in np.where(big & (np.linalg.norm(C - cc, axis=1) < 4 * d.max()))[0] for v in bm.faces[i].verts}
        flat = 0
        for vi in np.where(win)[0]:
            if vi in cloudv or np.hypot(rb * wrap(Tv[vi] - th), V[vi, 2] - zc) > d.max() * 1.12 or not (-.003 < Rv[vi] - rb < hgt * 1.6): continue
            vv = bm.verts[vi]; vv.co.x = AX[0] + (rb - .0003) * np.cos(Tv[vi]); vv.co.y = AX[1] + (rb - .0003) * np.sin(Tv[vi]); flat += 1
            for f in vv.link_faces:
                if not big[f.index]: cls[f.index] = COAT
        cu = rb * wrap(np.arctan2(C[big, 1] - AX[1], C[big, 0] - AX[0]) - th); cv = C[big, 2] - zc
        sel = np.hypot(cu, cv) < .25
        meas.append([th, zc, rb, float(np.median(tips)), phi0, hgt, np.stack([cu[sel], cv[sel]], 1)])
        print('ESTRELA centro (%.3f %.3f %.3f) raio do tubo %.4f, pontas %s, direção %.0f graus, relevo %.4f; %d vértices assentados' % (
            AX[0] + rb * np.cos(th), AX[1] + rb * np.sin(th), zc, rb, ' '.join('%.3f' % t for t in tips), np.degrees(phi0) % 72, hgt, flat), flush=True)
    bm.to_mesh(me); bm.free()
    # todas iguais: em pé (uma ponta para cima; as do Rodin já estavam a 12 a 22 graus disso) e do tamanho da mediana delas. A que
    # encostava numa nuvem anda para longe dela até ficar com 8 mm de folga (a estrela nova não entra na nuvem).
    if meas:
        Rm = float(np.median([s[3] for s in meas]))
        for s in meas:
            th, zc, rb, R, phi0, hgt, cl = s; du = dv = 0.
            for it in range(40):
                dd = np.hypot(cl[:, 0] - du, cl[:, 1] - dv); bad = dd < Rm + .008
                if not bad.any(): break
                away = -np.array([(cl[bad, 0] - du).mean(), (cl[bad, 1] - dv).mean()]); away /= np.linalg.norm(away)
                du += .002 * away[0]; dv += .002 * away[1]
            if du or dv: print('ESTRELA longe da nuvem: %.1f mm de lado, %.1f mm para cima' % (du * 1000, dv * 1000), flush=True)
            STARS.append((th + du / rb, zc + dv, rb, Rm, np.pi / 2, hgt))
        print('ESTRELAS em pé, ponta %.4f' % Rm, flush=True)

me.polygons.foreach_set('material_index', cls.astype(np.int32)); me.update()
for i, n in enumerate(NAMES): print('MAT', n, int((cls == i).sum()), 'faces', flush=True)

def star_outline(R, phi0, inner=.48, tip=.17, valley=.12, seg=9):
    """Contorno da estrela (anti-horário), com as pontas e os vãos arredondados; a ponta arredondada chega a R."""
    def build(Rp):
        P = [np.array([np.cos(phi0 + k * np.pi / 5), np.sin(phi0 + k * np.pi / 5)]) * (Rp if k % 2 == 0 else Rp * inner) for k in range(10)]
        out = []
        for k in range(10):
            p, a_, b_ = P[k], P[k - 1], P[(k + 1) % 10]
            da = (a_ - p) / np.linalg.norm(a_ - p); db = (b_ - p) / np.linalg.norm(b_ - p)
            half = np.arccos(np.clip(da @ db, -1, 1)) / 2; rho = R * (tip if k % 2 == 0 else valley)
            t1 = p + da * rho / np.tan(half); t2 = p + db * rho / np.tan(half)
            bis = (da + db) / np.linalg.norm(da + db); cen_ = p + bis * rho / np.sin(half)
            a1 = np.arctan2(*(t1 - cen_)[::-1]); a2 = np.arctan2(*(t2 - cen_)[::-1]); sw = wrap(a2 - a1)
            for s in np.linspace(0, 1, seg): out.append(cen_ + rho * np.array([np.cos(a1 + s * sw), np.sin(a1 + s * sw)]))
        return np.array(out)
    o = build(R); o = build(R * R / np.hypot(*o.T).max())
    return o
def add_star(bm, th, zc, rb, R, phi0, hgt, mat):
    o = star_outline(R, phi0); n = len(o)
    t = np.roll(o, -1, 0) - np.roll(o, 1, 0); t /= np.linalg.norm(t, axis=1)[:, None]
    inward = np.stack([-t[:, 1], t[:, 0]], 1)                       # anti-horário: a esquerda da tangente é para dentro
    b = min(.45 * hgt, .7 * .17 * R)
    rings = [(0, -.0015), (0, hgt - b)] + [(b * (1 - np.cos(a_)), hgt - b + b * np.sin(a_)) for a_ in np.linspace(0, np.pi / 2, 6)[1:]]
    def put(uv, hh):
        ang = th + uv[0] / rb; rr = rb + hh
        return bm.verts.new((AX[0] + rr * np.cos(ang), AX[1] + rr * np.sin(ang), zc + uv[1]))
    R_ = [[put(o[i] + inward[i] * off, hh) for i in range(n)] for off, hh in rings]
    faces = []
    for a_, b_ in zip(R_[:-1], R_[1:]):
        for i in range(n): faces.append(bm.faces.new((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i])))
    top = put(np.zeros(2), hgt)
    for i in range(n): faces.append(bm.faces.new((R_[-1][i], R_[-1][(i + 1) % n], top)))
    for f in faces: f.material_index = mat; f.smooth = True
    # as normais para fora: a estrela é estrelada em volta do eixo dela, então toda face olha para longe do meio dela
    core = Vector((AX[0] + (rb + hgt / 2) * np.cos(th), AX[1] + (rb + hgt / 2) * np.sin(th), zc))
    for f in faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - core) < 0: f.normal_flip()
    return len(faces)

# ── menos faces, sem mexer nas bordas entre cores ──
if RATIO < 1:
    bm = bmesh.new(); bm.from_mesh(me)
    edge = {v.index for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].material_index != e.link_faces[1].material_index for v in e.verts}
    bm.free()
    vg = obj.vertex_groups.new(name='borda'); vg.add(list(edge), 1.0, 'REPLACE')
    m = obj.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = RATIO; m.use_collapse_triangulate = True
    m.vertex_group = 'borda'; m.invert_vertex_group = True; m.vertex_group_factor = 100
    bpy.context.view_layer.objects.active = obj; bpy.ops.object.modifier_apply(modifier=m.name)
    g_ = obj.vertex_groups.get('borda')
    if g_: obj.vertex_groups.remove(g_)
print('FACES', nf, '->', len(me.polygons), flush=True)
if STARS:
    bm = bmesh.new(); bm.from_mesh(me)
    nfs = sum(add_star(bm, *s, NAMES.index('purple')) for s in STARS)
    bm.normal_update(); bm.to_mesh(me); bm.free(); me.update()
    print('ESTRELAS novas', len(STARS), 'com', nfs, 'faces', flush=True)
bpy.context.view_layer.objects.active = obj; obj.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=np.radians(40))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_materials='EXPORT', export_normals=True)
print('SAIDA', dst, os.path.getsize(dst), 'bytes', flush=True)
