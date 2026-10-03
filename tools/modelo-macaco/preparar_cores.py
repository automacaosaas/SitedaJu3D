"""Macaquinho colorido SEM textura (como pede o VITRINE-AVIAO-MACACO-QA.md do Luiz): a cor de cada face vem da textura do Rodin,
classificada em cinco materiais lisos -- fur (marrom), face (bege), features (preto: olhos, nariz, boca, sobrancelhas),
banana (amarelo) e highlight (brilho branco dos olhos). Nenhum se chama body/details/engines, então nada fica colorível no site.
Sem texturas o site não precisa buscar imagens por blob: (a CSP do site bloqueia isso em connect-src).
Fonte: o GLB do Rodin (`rodin-v2_-0 (9).glb`, recebido em 02/10/2026: malha de 500 mil triângulos com textura de cor 2048²;
antes, o (7) de 01/10). As posições de cada parte vêm da própria textura, então o script serve para outras versões do modelo.
Uso: blender -b -P preparar_cores.py -- <rodin.glb> <saida.glb> 0.6     (0.6 = fica com 60% das faces; depois, meshopt como em PERFORMANCE-QA.md)
"""
import bpy,bmesh,os,sys,numpy as np
from mathutils import Vector
a=sys.argv[sys.argv.index('--')+1:]
src,dst=os.path.abspath(a[0]),os.path.abspath(a[1]);ratio=float(a[2])
SMOOTH,ISLAND,FEATURE_MIN=4,400,60
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=src)
obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='macacoscopio';me=obj.data
before=len(me.polygons)
# o importador do glTF separa os vértices nas costuras da UV; solda de volta (a UV fica nos cantos das faces) para a malha ser contínua
bm=bmesh.new();bm.from_mesh(me);n0=len(bm.verts);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6);print("SOLDA",n0,"->",len(bm.verts),flush=True);bm.to_mesh(me);bm.free()

# Furo no alto da cabeça: a peça real é um tubo aberto (a coluna da lâmpada passa por dentro), mas o Rodin pode fechar a cabeça
# numa cúpula (o modelo (9) veio assim). Se o eixo bate em material no topo, um cilindro um pouco menor que o raio de dentro da
# cabeça tira a cúpula; a borda que sobra é o ombro arredondado dela, como na peça impressa.
from mathutils.bvhtree import BVHTree
def abrir_topo(obj):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm);V=np.array([v.co for v in bm.verts]);bm.free()
    zmax=float(V[:,2].max());c=(V.min(0)+V.max(0))[:2]/2      # centro da caixa (a média dos vértices puxa para onde há mais detalhe)
    hit=tree.ray_cast(Vector((c[0],c[1],zmax+.5)),Vector((0,0,-1)))[0]
    if hit is None or hit.z<zmax-.03:print('TOPO já aberto',flush=True);return
    zin=zmax-.25
    for it in range(3):            # centro do oco: média dos encontros com a parede de dentro, em 32 direções
        pts=[];o=Vector((c[0],c[1],zin))
        for a in np.linspace(0,2*np.pi,32,endpoint=False):
            loc=tree.ray_cast(o,Vector((np.cos(a),np.sin(a),0)))[0]
            if loc is not None:pts.append((loc.x,loc.y))
        pts=np.array(pts);c=pts.mean(0)
    rin=float(np.median(np.hypot(pts[:,0]-c[0],pts[:,1]-c[1])));rc=rin-.008
    bpy.ops.mesh.primitive_cylinder_add(vertices=256,radius=rc,depth=zmax+.1-zin,location=(c[0],c[1],(zmax+.1+zin)/2));cutter=bpy.context.object
    m=obj.modifiers.new('furo','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=cutter
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cutter,do_unlink=True)
    # a parede nova do furo (e o que mais o corte criou) fica marrom
    me=obj.data;nf_=len(me.polygons);C_=np.zeros(nf_*3);me.polygons.foreach_get('center',C_);C_=C_.reshape(-1,3)
    mi=np.zeros(nf_,np.int32);me.polygons.foreach_get('material_index',mi)
    wall=(C_[:,2]>zin)&(np.abs(np.hypot(C_[:,0]-c[0],C_[:,1]-c[1])-rc)<.004);mi[wall]=0;me.polygons.foreach_set('material_index',mi);me.update()
    print('TOPO aberto: eixo (%.4f, %.4f), raio de dentro %.4f, furo %.4f, parede do furo %d faces, faces %d'%(c[0],c[1],rin,rc,int(wall.sum()),nf_),flush=True)

# Superfície lisa. O Rodin deixou ondinhas horizontais de "camada de impressão" (e risquinhos verticais na barriga), com 1 a 3
# milésimos de altura e 8 a 12 arestas de comprimento. Alisa só isso: cada vértice anda na direção da normal (no máximo 3
# milésimos) e ficam parados os relevos de verdade, isto é, onde a curvatura sobrevive a um alisamento forte (olhos, nariz, boca,
# sobrancelhas, banana, mãos, orelhas, sulcos), os vincos encostados neles e as patinhas (relevo raso).
bpy.context.view_layer.objects.active=obj
if me.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
for p in me.polygons:p.use_smooth=True
def alisar(me,K=100,SHARP=20,FR=2,MAXD=.003,free=None):
    V0=np.zeros(len(me.vertices)*3);me.vertices.foreach_get('co',V0);V0=V0.reshape(-1,3);n=len(V0)
    E=np.zeros(len(me.edges)*2,int);me.edges.foreach_get('vertices',E);E=E.reshape(-1,2)
    T=np.zeros(len(me.polygons)*3,int);me.polygons.foreach_get('vertices',T);T=T.reshape(-1,3)
    deg=np.maximum(np.bincount(E.ravel(),minlength=n),1).astype(float)
    def avg(X):return np.stack([np.bincount(E[:,0],X[E[:,1],k],n)+np.bincount(E[:,1],X[E[:,0],k],n) for k in range(X.shape[1])],1)/deg[:,None]
    def grow(m,k):
        for it in range(k):m=m|(avg(m[:,None].astype(float))[:,0]>0)
        return m
    def vnormals(X):
        fn=np.cross(X[T[:,1]]-X[T[:,0]],X[T[:,2]]-X[T[:,0]]);N=np.zeros_like(X)
        for k in range(3):np.add.at(N,T[:,k],fn)
        return N/np.maximum(np.linalg.norm(N,axis=1),1e-12)[:,None]
    Vs=V0.copy()
    for it in range(40):Vs=Vs+.5*(avg(Vs)-Vs)
    H=np.abs(np.einsum('ij,ij->i',avg(Vs)-Vs,vnormals(Vs)))
    THR=.88*np.median(H)                     # escala da malha: a curvatura típica de uma superfície lisa
    for it in range(3):H=np.maximum(H,avg(H[:,None])[:,0])
    w=np.clip(1-(H-THR)/THR,0,1)
    w[(np.abs(V0[:,0])>.04)&(np.abs(V0[:,0])<.28)&(V0[:,2]<PAW_Z[1])&(V0[:,1]<-.15)]=0       # patinhas (relevo raso)
    bm=bmesh.new();bm.from_mesh(me);sharp=np.zeros(n,bool)
    for e in bm.edges:
        if len(e.link_faces)==2 and e.calc_face_angle()>np.radians(SHARP):sharp[e.verts[0].index]=sharp[e.verts[1].index]=True
    bm.free()
    keep=sharp&grow(H>1.5*THR,FR)
    if free is not None:keep&=~free       # dentro das áreas bege não há relevo a guardar: os vincos ali são risquinhos
    w[grow(keep,2)]=0
    for it in range(8):w=avg(w[:,None])[:,0]          # transição larga entre o que alisa e o que fica (sem degrau na base dos relevos)
    V=V0.copy()
    for it in range(K):
        N=vnormals(V);L=avg(V)-V;V=V+.3*w[:,None]*np.einsum('ij,ij->i',L,N)[:,None]*N
        d=V-V0;m=np.linalg.norm(d,axis=1);big=m>MAXD;V[big]=V0[big]+d[big]*(MAXD/m[big])[:,None]
    me.vertices.foreach_set('co',V.ravel());me.update()
    print('LISO: %.0f%% dos vertices parados (relevos), movimento p99 %.4f'%(100*(w<.5).mean(),np.percentile(np.linalg.norm(V-V0,axis=1),99)),flush=True)
if ratio<1:
    m=obj.modifiers.new('dec','DECIMATE');m.decimate_type='COLLAPSE';m.ratio=ratio;m.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=m.name)
me=obj.data;nf=len(me.polygons)

def image(label):
    return next(im for im in bpy.data.images if im.name.startswith(label))
def pixels(im):
    w,h=im.size;return np.array(im.pixels[:],np.float32).reshape(h,w,4)[...,:3],w,h
col,w,h=pixels(image('texture_diffuse'));mr,mw,mh=pixels(image('texture_metallic'))

# 4 amostras por face (centro e três pontos a 1/3 do caminho até cada vértice), voto pela maioria
uv=np.zeros(len(me.loops)*2,np.float32);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
ls=np.zeros(nf,np.int32);me.polygons.foreach_get('loop_start',ls)
c0,c1,c2=uv[ls],uv[ls+1],uv[ls+2];cen=(c0+c1+c2)/3
samples=[cen,(2*cen+c0)/3,(2*cen+c1)/3,(2*cen+c2)/3]
def at(img,iw,ih,p):
    x=np.clip((p[:,0]%1)*iw,0,iw-1).astype(int);y=np.clip((p[:,1]%1)*ih,0,ih-1).astype(int);return img[y,x]
NAMES=['fur','face','features','banana','highlight']
def classify(rgb):
    mx=rgb.max(1);mn=rgb.min(1);v=mx;s=np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0)
    r,g,b=rgb.T;d=np.maximum(mx-mn,1e-6)
    hh=np.where(mx==r,((g-b)/d)%6,np.where(mx==g,(b-r)/d+2,(r-g)/d+4))*60
    k=np.zeros(len(rgb),np.int8)                                  # 0 fur (marrom)
    k[(s<.42)&(v>.5)]=1                                               # 1 face (bege)
    k[(s<.15)&(v>=.5)]=4                                          # 4 highlight (branco/cinza claro)
    k[(v<.5)&(s<.35)]=2                                           # 2 features (preto)
    k[(hh>=35)&(hh<=70)&(s>.5)&(v>.35)]=3                         # 3 banana (amarelo)
    return k
votes=np.zeros((nf,5),np.int32)
for p in samples:
    k=classify(at(col,w,h,p));votes[np.arange(nf),k]+=1
cls=votes.argmax(1)

# Limpeza. A textura tem pinceladas e reflexos pintados (riscos marrons na borda do rosto, pintinhas marrons nos olhos,
# manchas claras nas costas). 1) Alisa as bordas: a face segue dois vizinhos que concordam entre si (o brilho dos olhos não
# é erodido). 2) Ilhas pequenas de uma cor viram a cor que as cerca; o brilho branco só fica onde está cercado de preto (olhos).
bm=bmesh.new();bm.from_mesh(me)
pairs=np.array([(e.link_faces[0].index,e.link_faces[1].index) for e in bm.edges if len(e.link_faces)==2],np.int64)
bm.free()
nb=np.full((nf,3),-1,np.int64);cnt=np.zeros(nf,np.int64)
for f,g in np.concatenate([pairs,pairs[:,::-1]]):
    if cnt[f]<3:nb[f,cnt[f]]=g;cnt[f]+=1
for it in range(SMOOTH):
    c=np.where(nb>=0,cls[nb],-1);x,y,z=c.T
    k=np.where((x==y)&(x>=0),x,np.where((x==z)&(x>=0),x,np.where((y==z)&(y>=0),y,-1)))
    ch=(k>=0)&(k!=cls)&(cls!=4);cls[ch]=k[ch];print('ALISA',it,int(ch.sum()),flush=True)
def components(cls):
    parent=np.arange(nf)
    def find(i):
        r=i
        while parent[r]!=r:r=parent[r]
        while parent[i]!=r:parent[i],i=r,parent[i]
        return r
    for f,g in pairs[cls[pairs[:,0]]==cls[pairs[:,1]]]:
        rf,rg=find(f),find(g)
        if rf!=rg:parent[max(rf,rg)]=min(rf,rg)
    return np.array([find(i) for i in range(nf)])
for rnd in range(3):
    root=components(cls);ids,inv,size=np.unique(root,return_inverse=True,return_counts=True)
    # vizinhança entre ilhas: para cada aresta entre classes diferentes, conta a classe do outro lado
    diff=pairs[cls[pairs[:,0]]!=cls[pairs[:,1]]]
    border={}
    for f,g in np.concatenate([diff,diff[:,::-1]]):
        d=border.setdefault(inv[f],np.zeros(5,np.int64));d[cls[g]]+=1
    changed=0
    for comp in np.where(size<ISLAND)[0]:
        b=border.get(comp)
        if b is None:continue
        k=cls[ids[comp]];target=int(b.argmax())
        if k==4 and target==2:continue                       # brilho cercado de preto: é o reflexo do olho, fica
        if k==2 and size[comp]>=FEATURE_MIN:continue        # detalhe preto pequeno mas legítimo
        faces=inv==comp;cls[faces]=target;changed+=int(size[comp])
    print('ILHAS',rnd,'componentes',len(ids),'faces trocadas',changed,flush=True)
    if not changed:break

# Posições de cada parte, tiradas das próprias cores da textura (o Rodin pode refazer o modelo com outras medidas): a placa do
# rosto e a barriga são as maiores áreas bege na frente da cabeça e do corpo; os olhos, as maiores áreas pretas de cada lado do
# rosto, com o brilho branco pintado dentro; as orelhas, as áreas bege viradas para a frente nas laterais; os pés, entre a
# barriga e a base.
cen0=np.zeros(nf*3);me.polygons.foreach_get('center',cen0);cen0=cen0.reshape(-1,3)
nrm0=np.zeros(nf*3);me.polygons.foreach_get('normal',nrm0);nrm0=nrm0.reshape(-1,3)
root=components(cls)
def regions(k):
    ids,cnt=np.unique(root[cls==k],return_counts=True)
    for j in np.argsort(-cnt,kind='stable'):
        m=root==ids[j];p=cen0[m];yield {'mask':m,'n':int(cnt[j]),'c':p.mean(0),'lo':p.min(0),'hi':p.max(0),'nrm':nrm0[m].mean(0)}
facecomp=next(r for r in regions(1) if abs(r['c'][0])<.2 and r['c'][2]>.2 and r['c'][1]<-.15)
bellycomp=next(r for r in regions(1) if abs(r['c'][0])<.2 and r['c'][2]<.2 and r['c'][1]<-.15)
def per_side(gen,cond):
    out={}
    for r in gen:
        s=1 if r['c'][0]>0 else -1
        if s not in out and cond(r):out[s]=r
        if len(out)==2:break
    return out
eyes=per_side(regions(2),lambda r:.05<abs(r['c'][0])<.3 and facecomp['lo'][2]<r['c'][2]<facecomp['hi'][2])
ears=per_side(regions(1),lambda r:abs(r['c'][0])>.3 and r['nrm'][1]<-.5)
brows=per_side((r for r in regions(2) if all(r['n']!=eyes[s_]['n'] or abs(r['c'][0]-eyes[s_]['c'][0])>1e-6 for s_ in eyes)),lambda r:.05<abs(r['c'][0])<.3 and r['c'][2]>max(e['hi'][2] for e in eyes.values()))
mouth=next(r for r in regions(2) if abs(r['c'][0])<.05 and facecomp['lo'][2]<r['c'][2]<facecomp['hi'][2])
EYES=[];shines=[]
for s in (-1,1):
    e=eyes[s];cx,cz=(e['lo'][0]+e['hi'][0])/2,(e['lo'][2]+e['hi'][2])/2;EYES.append((cx,cz,-s))
    hl=[r for r in regions(4) if e['lo'][0]<r['c'][0]<e['hi'][0] and e['lo'][2]<r['c'][2]<e['hi'][2]][:1]
    if hl:h_=hl[0];shines.append((abs(h_['c'][0]-cx),h_['c'][2]-cz,(h_['hi'][0]-h_['lo'][0])/2,(h_['hi'][2]-h_['lo'][2])/2))
SHINE=tuple(np.mean(shines,0)) if shines else (.005,.031,.012,.019)     # brilho: deslocamento para o centro do rosto, para cima, raios
def inside_point(r):
    # o ponto da própria região mais perto do centro dela (numa meia-lua o centro cai fora)
    i=np.where(r['mask'])[0];j=i[np.argmin(np.hypot(cen0[i,0]-r['c'][0],cen0[i,2]-r['c'][2]))];return float(cen0[j,0]),float(cen0[j,2])
EARS=[inside_point(ears[s]) for s in (-1,1)]
LINES=[inside_point(brows[s]) for s in (-1,1) if s in brows]+[inside_point(mouth)]
def sample(m,n=24):
    i=np.where(m)[0];return [(float(cen0[j,0]),float(cen0[j,2])) for j in i[np.linspace(0,len(i)-1,n).astype(int)]]
FACE_SEEDS,BELLY_SEEDS=sample(facecomp['mask']),sample(bellycomp['mask'])
HEAD_Z0=float(facecomp['lo'][2])-.03
BELLY_LO,BELLY_HI=bellycomp['lo'],bellycomp['hi']
PAW_Z=(float(cen0[:,2].min())+.02,float(BELLY_LO[2])-.01)
print('POSICOES rosto z %.3f..%.3f, barriga z %.3f..%.3f, olhos'%(facecomp['lo'][2],facecomp['hi'][2],BELLY_LO[2],BELLY_HI[2]),[(round(a,3),round(b,3)) for a,b,_ in EYES],
      'brilho',tuple(round(v,4) for v in SHINE),'orelhas',[(round(a,3),round(b,3)) for a,b in EARS],'pés z %.3f..%.3f'%PAW_Z,flush=True)
# Placa do rosto. A textura pinta a parede do sulco em volta do rosto num marrom-claro igual ao bege na sombra, então a cor
# não decide sozinha. A geometria decide: enche a partir de pontos da placa (testa, bochechas e focinho) sem atravessar
# dobras côncavas acima de 10 graus (o fundo do sulco). Dentro: bege (os detalhes pretos ficam); fora, na frente da cabeça: marrom.
from collections import deque
bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table();bm.edges.ensure_lookup_table()
cen3=np.array([f.calc_center_median() for f in bm.faces])
ang=np.array([e.calc_face_angle_signed() if len(e.link_faces)==2 else 0 for e in bm.edges]);lim=-np.radians(10)
plate=np.zeros(nf,bool)
for sx,sz in FACE_SEEDS:
    cand=np.where((cls==1)&(cen3[:,1]<-.2))[0];seed=cand[np.argmin(np.hypot(cen3[cand,0]-sx,cen3[cand,2]-sz))]
    seen=np.zeros(nf,bool);seen[seed]=True;q=deque([seed])
    while q:
        for e in bm.faces[q.popleft()].edges:
            if len(e.link_faces)!=2 or ang[e.index]<lim:continue
            for g in e.link_faces:
                if not seen[g.index]:seen[g.index]=True;q.append(g.index)
    ok=seen.sum()<40000 and cen3[seen,2].min()>HEAD_Z0-.05 and np.abs(cen3[seen,0]).max()<.32
    if not ok:print('PLACA semente',(round(sx,3),round(sz,3)),int(seen.sum()),'faces: VAZOU, ignorada',flush=True)
    if ok:plate|=seen
head=(np.abs(cen3[:,0])<.30)&(cen3[:,1]<-.15)&(cen3[:,2]>HEAD_Z0)
inside=plate&(cls==0);outside=head&~plate&(cls==1)
cls[inside]=1;cls[outside]=0
print('PLACA',int(plate.sum()),'faces; marrom->bege',int(inside.sum()),'; bege fora da placa->marrom',int(outside.sum()),flush=True)
# Barriga: o mesmo critério do rosto (a textura deixava fiapos marrons na borda). Enche a partir de pontos da barriga até o sulco
# em volta dela; dentro: bege (a banana e as mãos, que têm a própria base, ficam); fora, na frente do corpo: marrom.
belly=np.zeros(nf,bool)
for sx,sz in BELLY_SEEDS:
    cand=np.where((cls==1)&(cen3[:,1]<-.2)&(cen3[:,2]<BELLY_HI[2]+.05))[0];seed=cand[np.argmin(np.hypot(cen3[cand,0]-sx,cen3[cand,2]-sz))]
    seen=np.zeros(nf,bool);seen[seed]=True;q=deque([seed])
    while q:
        for e in bm.faces[q.popleft()].edges:
            if len(e.link_faces)!=2 or ang[e.index]<lim:continue
            for g in e.link_faces:
                if not seen[g.index]:seen[g.index]=True;q.append(g.index)
    ok=seen.sum()<60000 and cen3[seen,2].max()<BELLY_HI[2]+.1 and np.abs(cen3[seen,0]).max()<max(abs(BELLY_LO[0]),abs(BELLY_HI[0]))+.06
    if not ok:print('BARRIGA semente',(round(sx,3),round(sz,3)),int(seen.sum()),'faces: VAZOU, ignorada',flush=True)
    if ok:belly|=seen
bm.free()
box=(np.abs(cen3[:,0])<max(abs(BELLY_LO[0]),abs(BELLY_HI[0]))+.06)&(cen3[:,1]<-.15)&(cen3[:,2]>BELLY_LO[2]-.05)&(cen3[:,2]<BELLY_HI[2]+.06)
inside=belly&(cls==0);outside=box&~belly&(cls==1)
cls[inside]=1;cls[outside]=0
print('BARRIGA',int(belly.sum()),'faces; marrom->bege',int(inside.sum()),'; bege fora->marrom',int(outside.sum()),flush=True)

bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table();bm.edges.ensure_lookup_table()
nrm3=np.array([f.normal for f in bm.faces])
# Parede de dentro do tubo: a textura projetou a barriga através dela (mancha bege vista pela abertura de trás). Tudo o que
# está dentro do tubo e virado para o eixo fica marrom.
top=cen3[:,2]>cen3[:,2].max()-.05;axis=cen3[top][:,:2].mean(0)
d=cen3[:,:2]-axis;r=np.hypot(d[:,0],d[:,1]);out_dot=(nrm3[:,0]*d[:,0]+nrm3[:,1]*d[:,1])/np.maximum(r,1e-6)
inner=(r<.30)&(out_dot<-.3)&(cls!=0);print('DENTRO',int(inner.sum()),'faces viradas para dentro ->marrom',flush=True);cls[inner]=0

# Olhos: o oval preto de cada olho, com os buracos de dentro preenchidos (pintinhas e o reflexo recortado da textura), e um
# brilho oval liso no alto, igual nos dois olhos (espelhado).
nbr=[[g.index for e in f.edges for g in e.link_faces if g is not f] for f in bm.faces]
def grow(start,allowed):
    seen=np.zeros(nf,bool);seen[start]=True;q=deque(int(s) for s in start)
    while q:
        for g in nbr[q.popleft()]:
            if allowed[g] and not seen[g]:seen[g]=True;q.append(g)
    return seen
def nearest(mask,x,z):
    c=np.where(mask&(cen3[:,1]<-.05))[0];return c[np.argmin(np.hypot(cen3[c,0]-x,cen3[c,2]-z))]
cls[cls==4]=2
for ex,ez,sx in EYES:
    comp=grow([nearest(cls==2,ex,ez)],cls==2)
    p=cen3[comp];x0,x1,z0,z1=p[:,0].min(),p[:,0].max(),p[:,2].min(),p[:,2].max()
    zone=(cen3[:,0]>x0-.02)&(cen3[:,0]<x1+.02)&(cen3[:,2]>z0-.02)&(cen3[:,2]<z1+.02)&(cen3[:,1]<-.05)
    edge=[i for i in np.where(zone&~comp)[0] if any(not zone[g] for g in nbr[i])]
    outside=grow(edge,zone&~comp);eye=comp|(zone&~outside)
    cls[eye]=2;cx,cz=(x0+x1)/2,(z0+z1)/2;hx,hz=cx+sx*SHINE[0],cz+SHINE[1]
    shine=eye&(((cen3[:,0]-hx)/SHINE[2])**2+((cen3[:,2]-hz)/SHINE[3])**2<1);cls[shine]=4
    print('OLHO',int(comp.sum()),'faces pretas +',int((eye&~comp).sum()),'preenchidas; centro',(round(cx,3),round(cz,3)),'brilho',int(shine.sum()),flush=True)
# Em volta dos relevos, dentro do rosto, nada de contorno marrom: buracos da placa (cercados por ela) ficam bege.
hole=head&~plate&(cls==0)
lab=np.full(nf,-1);k=0;fixed=0
for s in np.where(hole)[0]:
    if lab[s]>=0:continue
    q=deque([s]);lab[s]=k;mem=[s];touches=False
    while q:
        for gi in nbr[q.popleft()]:
            if hole[gi]:
                if lab[gi]<0:lab[gi]=k;q.append(gi);mem.append(gi)
            elif not plate[gi] and cls[gi]!=2:touches=True
    if not touches:cls[mem]=1;fixed+=len(mem)
    k+=1
print('CONTORNO',fixed,'faces marrons cercadas pelo rosto viraram bege',flush=True)
# (Orelhas: decididas no corte liso, mais adiante, pela forma da concha.)
bm.free()
for k in range(5):
    root=components(cls)[cls==k];_,s=np.unique(root,return_counts=True);s=np.sort(s)[::-1]
    print('REGIOES',NAMES[k],len(s),'maiores',s[:8].tolist(),flush=True)

# Cores do macaco (as definidas no modelo de 01/10/2026, iguais em qualquer versão do Rodin): sRGB e rugosidade de cada material
PALETTE={'fur':((99,41,27),.431),'face':((212,168,144),.361),'features':((37,35,35),.25),'banana':((244,199,3),.416),'highlight':((244,243,244),.25)}
def lin(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
me.materials.clear()
for i,n in enumerate(NAMES):
    srgb,rough=PALETTE[n];sel=cls==i
    mat=bpy.data.materials.new(n);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*lin(np.array(srgb)/255),1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=0
    me.materials.append(mat)
    print('MAT',n,int(sel.sum()),'faces sRGB',srgb,'rough',rough,flush=True)
me.polygons.foreach_set('material_index',cls.astype(np.int32))
# alisa depois de classificar (a forma original decide as cores; o sulco do rosto, por exemplo) e antes dos cortes de contorno.
# Vértices cercados só de faces bege (miolo do rosto, da barriga e das orelhas) alisam mesmo junto de vincos.
_T=np.zeros(len(me.polygons)*3,int);me.polygons.foreach_get('vertices',_T);_T=_T.reshape(-1,3)
_nall=np.bincount(_T.ravel(),minlength=len(me.vertices));_ntan=np.bincount(_T[cls==1].ravel(),minlength=len(me.vertices))
alisar(me,free=(_ntan==_nall)&(_nall>0))
def relevo_local(me,N=150):
    V=np.zeros(len(me.vertices)*3);me.vertices.foreach_get('co',V);V=V.reshape(-1,3);n=len(V)
    E=np.zeros(len(me.edges)*2,int);me.edges.foreach_get('vertices',E);E=E.reshape(-1,2)
    deg=np.maximum(np.bincount(E.ravel(),minlength=n),1).astype(float)
    avg=lambda X:np.stack([np.bincount(E[:,0],X[E[:,1],k],n)+np.bincount(E[:,1],X[E[:,0],k],n) for k in range(3)],1)/deg[:,None]
    Vs=V.copy()
    for it in range(N):Vs=Vs+.5*(avg(Vs)-Vs)
    Nv=np.zeros(len(me.vertices)*3);me.vertices.foreach_get('normal',Nv);Nv=Nv.reshape(-1,3)
    return V,np.einsum('ij,ij->i',V-Vs,Nv)
from mathutils import kdtree
_V,DET=relevo_local(me);KD=kdtree.KDTree(len(_V))
for i,p in enumerate(_V):KD.insert(p,i)
KD.balance()

# Contornos lisos. Pintar faces inteiras deixa o contorno com o desenho dos triângulos (serrilhado onde são grandes). Aqui a
# malha é cortada ao longo de curvas da própria forma e cada lado recebe sua cor: a concha das orelhas até onde a borda
# começa a subir, o olho até onde o relevo começa e o brilho como um oval exato.
FUR,FACE,FEAT,HIGH=0,1,2,4
def cut(bm,fn,faces,inside_mat,domain=None,fnv=None):
    """Parte as faces ao longo de fn==0 (fn<0 é dentro) e pinta de inside_mat as que ficam inteiras dentro."""
    val={}
    for f in faces:
        for v in f.verts:
            if v not in val:x=fnv(v) if fnv else fn(v.co);val[v]=x if abs(x)>=1e-12 else 1e-12
    # ordem fixa (índices), para o arquivo sair igual a cada execução
    bm.edges.index_update();zero=[]
    for e in sorted({e for f in faces for e in f.edges},key=lambda e:e.index):
        a,b=e.verts
        if (val[a]<0)!=(val[b]<0):
            t=val[a]/(val[a]-val[b]);p=a.co.lerp(b.co,t)
            _,nv=bmesh.utils.edge_split(e,a,t);nv.co=p;val[nv]=0.0;zero.append(nv)
    zs_=set(zero)
    for f in list(dict.fromkeys(f for v in zero for f in v.link_faces)):
        if not f.is_valid:continue
        zs=[v for v in f.verts if v in zs_]
        if len(zs)!=2:continue
        a,b=zs
        if any(b in e.verts for e in a.link_edges if f in e.link_faces):continue
        try:bmesh.utils.face_split(f,a,b)
        except Exception:pass
    painted=0
    for f in bm.faces:
        vals=[val.get(v) for v in f.verts]
        if None in vals:continue
        if domain is not None and not domain(f):continue     # só faces da própria área (não as vizinhas que compartilham vértices)
        if all(x<=0 for x in vals) and min(vals)<0:f.material_index=inside_mat;painted+=1
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    return painted
def front_out(f):
    # virado para fora do tubo (não a parede de dentro), na frente
    c=f.calc_center_median();return (c.x-axis[0])*f.normal.x+(c.y-axis[1])*f.normal.y>0
def contorno_liso(bm,inzone,k_in,k_out,iters=6,levels=1,clip=None):
    """Contorno liso para uma área cujo formato vem da textura: subdivide a zona (triângulos menores), dá a cada vértice a fração
    das faces vizinhas de cor k_in, suaviza esse valor entre vizinhos e corta a malha onde ele vale 1/2."""
    for it in range(levels):
        bm.edges.index_update()
        bmesh.ops.subdivide_edges(bm,edges=sorted({e for f in bm.faces if inzone(f) for e in f.edges},key=lambda e:e.index),cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    zone=[f for f in bm.faces if inzone(f)];zs=set(zone)
    verts=list(dict.fromkeys(v for f in zone for v in f.verts));idx={v:i for i,v in enumerate(verts)}
    val=np.array([sum(1 for g in v.link_faces if g in zs and g.material_index==k_in)/max(1,sum(1 for g in v.link_faces if g in zs)) for v in verts])
    nb_=[[idx[e.other_vert(v)] for e in v.link_edges if e.other_vert(v) in idx] for v in verts]
    for it in range(iters):val=.5*val+.5*np.array([val[n].mean() if n else val[i] for i,n in enumerate(nb_)])
    vmap=dict(zip(verts,val))
    for f in zone:
        if f.material_index==k_in:f.material_index=k_out
    fnv=(lambda v:max(.5-vmap[v],clip(v.co))) if clip else (lambda v:.5-vmap[v])     # clip: a forma que a área não pode passar
    k=cut(bm,None,zone,k_in,domain=inzone,fnv=fnv);bm.faces.ensure_lookup_table();return k
def connected(bm,start,ok):
    seen={start};q=deque([start])
    while q:
        for e in q.popleft().edges:
            for g in e.link_faces:
                if g not in seen and ok(g):seen.add(g);q.append(g)
    return seen
bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
# orelhas: o formato da concha vem da textura (bege dentro da borda); o contorno é alisado e cortado na malha. O lado de trás da
# orelha fica marrom.
for ex,ez in EARS:
    inzone=lambda f,ex=ex,ez=ez:abs(f.calc_center_median().x-ex)<.16 and abs(f.calc_center_median().z-ez)<.16 and abs(f.calc_center_median().x)>.28 and f.calc_center_median().y<.05
    for f in bm.faces:
        if inzone(f) and f.normal.y>=-.2 and f.material_index==FACE:f.material_index=FUR
    k=contorno_liso(bm,lambda f,z=inzone:z(f) and f.normal.y<-.2,FACE,FUR)
    print('ORELHA LISA',round(ex,3),'bege',k,flush=True)
# olhos: o oval preto vem da textura; o contorno é alisado e cortado na malha (sem as pontas dos triângulos grandes); o brilho é um
# oval no alto, espelhado entre os olhos
for ex,ez,sx in EYES:
    eyef=[f for f in bm.faces if f.material_index in (FEAT,HIGH) and abs(f.calc_center_median().x-ex)<.09 and abs(f.calc_center_median().z-ez)<.1 and f.calc_center_median().y<-.05]
    seed=min(eyef,key=lambda f:np.hypot(f.calc_center_median().x-ex,f.calc_center_median().z-ez))
    comp=connected(bm,seed,lambda g:g.material_index in (FEAT,HIGH))
    p=np.array([f.calc_center_median() for f in comp]);cx,cz=(p[:,0].min()+p[:,0].max())/2,(p[:,2].min()+p[:,2].max())/2
    ax,az=(p[:,0].max()-p[:,0].min())/2,(p[:,2].max()-p[:,2].min())/2
    ell=lambda co,s:((co.x-cx)/(ax*s))**2+((co.z-cz)/(az*s))**2
    inz=lambda f:f.calc_center_median().y<-.15 and front_out(f) and ell(f.calc_center_median(),1)<1.35**2
    for f in bm.faces:
        if inz(f) and f.material_index==HIGH:f.material_index=FEAT
    # o olho é um oval: o preto fica dentro do oval ajustado à mancha preta (momentos de área), 2% folgado, sem as lascas soltas
    P_=np.array([(f.calc_center_median().x,f.calc_center_median().z) for f in comp]);A_=np.array([f.calc_area() for f in comp])
    mu=(P_*A_[:,None]).sum(0)/A_.sum();Cv=((P_-mu).T*A_)@(P_-mu)/A_.sum();w_,V_=np.linalg.eigh(Cv);axes=2*np.sqrt(w_)*1.02
    oval=lambda co:float((((np.array([co.x,co.z])-mu)@V_)/axes)**2 @ np.ones(2))-1
    k=contorno_liso(bm,inz,FEAT,FACE,levels=1,clip=oval)
    hx,hz=cx+sx*SHINE[0],cz+SHINE[1]
    # triângulos menores sob o brilho, para o oval sair redondo (subdividir não muda a forma)
    for it in range(1):
        sub=[f for f in bm.faces if f.material_index==FEAT and ((f.calc_center_median().x-hx)/.02)**2+((f.calc_center_median().z-hz)/.027)**2<1 and f.calc_center_median().y<-.05]
        bm.edges.index_update()
        bmesh.ops.subdivide_edges(bm,edges=sorted({e for f in sub for e in f.edges},key=lambda e:e.index),cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    eye=[f for f in bm.faces if f.material_index==FEAT and ell(f.calc_center_median(),1)<1.35**2 and f.calc_center_median().y<-.05]
    s=cut(bm,lambda co:((co.x-hx)/SHINE[2])**2+((co.z-hz)/SHINE[3])**2-1,eye,HIGH);bm.faces.ensure_lookup_table()
    print('OLHO LISO',round(ex,3),'preto',k,'brilho',s,flush=True)
# sobrancelhas, nariz e boca: o desenho vem da textura; só o contorno é alisado (de leve, porque são finos)
for lx,lz in LINES:
    seed=min((f for f in bm.faces if f.material_index==FEAT and f.calc_center_median().y<-.05),key=lambda f:np.hypot(f.calc_center_median().x-lx,f.calc_center_median().z-lz))
    comp=connected(bm,seed,lambda g:g.material_index==FEAT)
    p=np.array([f.calc_center_median() for f in comp]);x0,x1,z0,z1=p[:,0].min()-.012,p[:,0].max()+.012,p[:,2].min()-.012,p[:,2].max()+.012
    inz=lambda f,b=(x0,x1,z0,z1):b[0]<f.calc_center_median().x<b[1] and b[2]<f.calc_center_median().z<b[3] and f.calc_center_median().y<-.15 and front_out(f) and f.material_index in (FEAT,FACE)
    k=contorno_liso(bm,inz,FEAT,FACE,iters=3)
    print('TRACO LISO',(round(lx,3),round(lz,3)),'preto',k,flush=True)
# patinhas (o relevo raso embaixo, na frente) na cor da pele. Centro de cada uma pelo relevo local (altura sobre a média larga em
# volta); numa área justa em volta dela (longe do sulco da barriga e da borda de baixo), a superfície do corpo é ajustada pela parte
# de baixo dos pontos e a patinha é o que se ergue acima dela, cortada a 35% da altura máxima.
A=lambda q:np.stack([np.ones(len(q)),q[:,0],q[:,2],q[:,0]**2,q[:,2]**2,q[:,0]*q[:,2]],1)
for side in (-1,1):
    out=lambda co,nr:(co.x-axis[0])*nr.x+(co.y-axis[1])*nr.y>0
    cand=[i for i,p in enumerate(_V) if side*p[0]>.05 and abs(p[0])<.27 and PAW_Z[0]<p[2]<PAW_Z[1] and p[1]<-.15]
    d=DET[cand];top=np.array(cand)[d>.5*d.max()];cx,cz=_V[top,0].mean(),_V[top,2].mean()
    inb=lambda c:abs(c.x-cx)<.085 and abs(c.z-cz)<.09 and c.y<-.15
    ring=np.array([v.co for v in bm.verts if inb(v.co) and out(v.co,v.normal)])
    for it in range(10):
        coef=np.linalg.lstsq(A(ring),ring[:,1],rcond=None)[0];res=A(ring)@coef-ring[:,1];ring=ring[res<.001]
    height=lambda co:float(A(np.array([co]))@coef-co.y)
    region=[f for f in bm.faces if inb(f.calc_center_median()) and out(f.calc_center_median(),f.normal)]
    hmax=max(height(v.co) for f in region for v in f.verts);h0=.2*hmax
    for f in region:f.material_index=FUR
    k=cut(bm,lambda co:h0-height(co),region,FACE,domain=lambda f:inb(f.calc_center_median()) and out(f.calc_center_median(),f.normal));bm.faces.ensure_lookup_table()
    # pedacinhos soltos (menos de 10% do maior) voltam a marrom; marrom cercado pelo pé vira bege
    zf=[f for f in bm.faces if inb(f.calc_center_median()) and out(f.calc_center_median(),f.normal)];zset=set(zf);seen=set();comps=[]
    for f in zf:
        if f.material_index==FACE and f not in seen:c=connected(bm,f,lambda g:g in zset and g.material_index==FACE);seen|=c;comps.append(c)
    big=max(len(c) for c in comps)
    for c in comps:
        if len(c)<.1*big:
            for f in c:f.material_index=FUR
    edge=[f for f in zf if f.material_index!=FACE and any(g not in zset for e in f.edges for g in e.link_faces)];outside=set()
    for f in edge:
        if f not in outside:outside|=connected(bm,f,lambda g:g in zset and g.material_index!=FACE)
    for f in zf:
        if f.material_index!=FACE and f not in outside:f.material_index=FACE
    print('PATINHA centro (%.3f, %.3f) altura maxima %.4f corte %.4f bege'%(cx,cz,hmax,h0),k,flush=True)
# por segurança, no fim: dentro do tubo (virado para o eixo) é sempre marrom
bm.faces.ensure_lookup_table();k=0
for f in bm.faces:
    c=f.calc_center_median();dx,dy=c.x-axis[0],c.y-axis[1];r=float(np.hypot(dx,dy))
    if r<.30 and (f.normal.x*dx+f.normal.y*dy)/max(r,1e-6)<-.3 and f.material_index!=FUR:f.material_index=FUR;k+=1
print("DENTRO no fim",k,"faces ->marrom",flush=True)
bm.to_mesh(me);bm.free();me.update()
# furo no alto da cabeça, depois das cores (a testa sobe pela cúpula: cortar antes abriria caminho no sulco do rosto)
abrir_topo(obj);me=obj.data
while me.uv_layers:me.uv_layers.remove(me.uv_layers[0])
for im in list(bpy.data.images):bpy.data.images.remove(im)
for mat in list(bpy.data.materials):
    if mat.users==0:bpy.data.materials.remove(mat)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_materials='EXPORT')
print('CORES',before,'->',nf,'faces;',os.path.getsize(dst),'bytes',flush=True)
