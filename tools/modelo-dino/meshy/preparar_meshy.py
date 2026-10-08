"""Dinossauro do Meshy (`Meshy_AI__1005212758_model-edit.glb`, recebido em 05/10/2026: o dinossauro inteiro, só a forma, sem textura nem
cor, com os 2 espinhos da crista da peça nova) com as partes do site em materiais lisos, sem textura (a CSP do site não deixa carregar a
textura embutida):
- body: cabeça e corpo, e details: os 2 espinhos e as 5 bolinhas de cada pé (o site pinta os dois nas cores escolhidas);
- eyes: olhos e sobrancelhas, pretos; teeth: os 4 dentes, brancos; highlight: o brilho oval de cada olho, branco (fixos).
Cada parte é uma área em relevo cercada por um sulco. O sulco vem da própria malha (o vértice menos a malha alisada em 8 passadas, ao
longo da normal, abaixo de -0,4 mm), engrossado 3 vértices para fechar as falhas; as áreas fora dele, ligadas entre si, são as partes,
reconhecidas pelo lugar (CLASSES). O sulco é dividido entre os dois lados (o contorno fica no meio dele), alisado e cortado na malha.
O brilho é uma elipse ajustada à borda do oval em relevo dentro de cada olho, no mapa de profundidade visto de frente.
Uso: blender -b -P preparar_meshy.py -- <meshy.glb> <saida.glb>
Depois, a compressão Meshopt dos outros modelos (PERFORMANCE-QA.md) e dist/assets/models/dinossauroscopio.glb.
"""
import sys,os;D=os.path.dirname(os.path.abspath(__file__));sys.dont_write_bytecode=True     # sem __pycache__ na pasta
sys.path.insert(0,os.path.join(D,'..','..','modelo-macaco','meshy'))
import bpy,bmesh,heapq,numpy as np
from collections import deque
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from util import blur                                           # gaussiana que ignora NaN
import regioes;regioes.np=np                                    # (lá o numpy vem do script que o carrega)
from regioes import bfs,perto,tapar_furos,encolher               # mapas em grade (do macaco do Meshy)
exec(open(os.path.join(D,'..','..','modelo-macaco','meshy','cut.py'),encoding='utf-8').read())   # cut(): corta a malha em fn == 0

NAMES=['body','details','eyes','teeth','highlight'];BODY,DETAILS,EYES,TEETH,HIGH=range(5)
# cores da vitrine (corpo verde-musgo, crista e bolinhas amarelo-claro: o site troca pelas escolhidas); fixos como no modelo anterior
PALETTE={'body':('616c52',.48),'details':('f0dd7c',.48),'eyes':('141821',.27),'teeth':('ffffff',.48),'highlight':('ffffff',.25)}
SULCO,ENGROSSAR,ALISAR=.0004,3,8
# Cada área em relevo pelo centro (x à direita, y para trás: a frente é -y, z para cima), em unidades do modelo (1,9 de altura)
CLASSES=[('espinho de cima',DETAILS,lambda x,y,z:abs(x)<.1 and z>.75),
         ('espinho de trás',DETAILS,lambda x,y,z:abs(x)<.1 and y>.2 and .5<z<.8),
         ('bolinha do pé',DETAILS,lambda x,y,z:abs(x)>.38 and z<-.6),
         ('olho',EYES,lambda x,y,z:.17<abs(x)<.24 and .55<z<.65 and y<-.25),
         ('sobrancelha',EYES,lambda x,y,z:.13<abs(x)<.21 and .70<z<.76 and y<-.15),
         ('dente',TEETH,lambda x,y,z:abs(x)<.25 and .30<z<.40 and y<-.3)]
ESPERADO={'espinho de cima':1,'espinho de trás':1,'bolinha do pé':10,'olho':2,'sobrancelha':2,'dente':4}

def importar(src):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=src)
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    # a malha vem dentro de um vazio ("MeshEdit original coordinates"): aplica a transformação e solta
    mw=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=mw
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not obj:bpy.data.objects.remove(o,do_unlink=True)
    obj.name=obj.data.name='dinossauroscopio';me=obj.data
    # as normais que vêm no arquivo (mais lisas que as que o Blender recalcula, que chegam a mudar 0,57 em volta dos dentes) medem o relevo;
    # depois saem, e o modelo fica com as normais lisas do Blender (como o macaco)
    N=np.zeros(len(me.vertices)*3);me.vertices.foreach_get('normal',N);N=N.reshape(-1,3)
    if me.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for p in me.polygons:p.use_smooth=True
    return obj,N

def vizinhos(E,n):
    """vizinhos de cada vértice em CSR (ordem fixa)"""
    a=np.r_[E[:,0],E[:,1]];b=np.r_[E[:,1],E[:,0]];o=np.lexsort((b,a));a,b=a[o],b[o]
    return np.r_[0,np.cumsum(np.bincount(a,minlength=n))],b

def media(A,E,n,deg,k):
    for _ in range(k):
        acc=np.zeros_like(A)
        if A.ndim==1:acc=np.bincount(E[:,0],A[E[:,1]],n)+np.bincount(E[:,1],A[E[:,0]],n)
        else:
            for c in range(A.shape[1]):acc[:,c]=np.bincount(E[:,0],A[E[:,1],c],n)+np.bincount(E[:,1],A[E[:,0],c],n)
        A=acc/(deg if A.ndim==1 else deg[:,None])
    return A

def partes(me,N):
    """a parte de cada vértice (BODY, DETAILS, EYES, TEETH); N: as normais do arquivo"""
    n=len(me.vertices);V=np.zeros(n*3);me.vertices.foreach_get('co',V);V=V.reshape(-1,3)
    E=np.zeros(len(me.edges)*2,int);me.edges.foreach_get('vertices',E);E=E.reshape(-1,2)
    deg=np.bincount(E.ravel(),minlength=n).astype(float);ptr,nb=vizinhos(E,n)
    d=((V-media(V,E,n,deg,ALISAR))*N).sum(1);G=d<-SULCO
    for _ in range(ENGROSSAR):g=G.copy();g[E[:,0]]|=G[E[:,1]];g[E[:,1]]|=G[E[:,0]];G=g
    comp=-np.ones(n,int);areas=[]
    for s in range(n):
        if G[s] or comp[s]>=0:continue
        q=deque([s]);comp[s]=len(areas);m=[s]
        while q:
            i=q.popleft()
            for j in nb[ptr[i]:ptr[i+1]]:
                if not G[j] and comp[j]<0:comp[j]=comp[s];q.append(j);m.append(j)
        areas.append(np.array(m))
    L=-np.ones(n,int);achou={k:0 for k in ESPERADO}
    for m in areas:
        x,y,z=V[m].mean(0);parte=BODY
        if len(m)>=100:
            for nome,p,teste in CLASSES:
                if teste(x,y,z):parte=p;achou[nome]+=1;print('PARTE %-15s %5d vértices em (%+.3f, %+.3f, %+.3f)'%(nome,len(m),x,y,z),flush=True);break
        L[m]=parte
    if achou!=ESPERADO:raise SystemExit('partes diferentes do esperado: %s'%achou)
    # o sulco fica dividido entre os dois lados no fundo dele: cada lado desce o sulco pelo vértice mais alto que encosta nele, até os
    # dois se encontrarem onde ele é mais fundo (a borda de cor fica no vinco da peça, mesmo onde o sulco é largo de um lado só)
    h=[];k=0
    for i in np.where(L>=0)[0]:
        for j in nb[ptr[i]:ptr[i+1]]:
            if L[j]<0:heapq.heappush(h,(-d[j],k,int(j),int(L[i])));k+=1
    while h:
        _,_,j,lab=heapq.heappop(h)
        if L[j]>=0:continue
        L[j]=lab
        for m in nb[ptr[j]:ptr[j+1]]:
            if L[m]<0:heapq.heappush(h,(-d[m],k,int(m),lab));k+=1
    return L,E,deg

def mapa_olhos(obj,S=.001):
    """profundidade vista de frente (raios de -y) na altura dos olhos"""
    bm=bmesh.new();bm.from_mesh(obj.data);tree=BVHTree.FromBMesh(bm);bm.free()
    X=np.arange(-.30,.30,S);Z=np.arange(.47,.71,S);Y=np.full((len(Z),len(X)),np.nan)
    for j,x in enumerate(X):
        for i,z in enumerate(Z):
            loc=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)[0]
            if loc:Y[i,j]=loc.y
    return X,Z,Y

def conica(x,z):
    """elipse (cx, cz, semieixo, semieixo, ângulo) por mínimos quadrados"""
    mx,mz=x.mean(),z.mean();u,v=x-mx,z-mz;A=np.stack([u*u,u*v,v*v,u,v],1);k=np.linalg.lstsq(A,np.ones(len(u)),rcond=None)[0]
    M=np.array([[k[0],k[1]/2],[k[1]/2,k[2]]]);c0=np.linalg.solve(2*M,-k[3:5]);f0=1+c0@M@c0;w,W=np.linalg.eigh(M/f0)
    return [float(mx+c0[0]),float(mz+c0[1]),float(1/np.sqrt(abs(w[0]))),float(1/np.sqrt(abs(w[1]))),float(np.arctan2(W[1,0],W[0,0]))]

def elipse(e,x,z):
    """< 0 dentro, aproximadamente a distância à borda em unidades do modelo"""
    cx,cz,a,b,ang=e;dx,dz=x-cx,z-cz;u=dx*np.cos(ang)+dz*np.sin(ang);v=-dx*np.sin(ang)+dz*np.cos(ang)
    return (np.sqrt((u/a)**2+(v/b)**2)-1)*min(a,b)

def brilhos(obj):
    """O brilho de cada olho: um oval baixo em relevo no alto do olho, para fora. A borda dele (o que muda depressa numa escala de 3 mm,
    longe da beira do olho) ganha uma elipse; os dois olhos ficam com a mesma (espelhada)."""
    X,Z,Y=mapa_olhos(obj);S=X[1]-X[0];ok=np.isfinite(Y);G=(-(Y-blur(Y,8))<-SULCO)|~ok;livre=~G&ok;hp3=-(Y-blur(Y,3))
    cell=lambda x,z:(int(round((z-Z[0])/S)),int(round((x-X[0])/S)));els=[]
    for lado in (-1,1):
        olho=tapar_furos(bfs(livre,perto(livre,cell(lado*.17,.57)),lim=60000));miolo=encolher(olho,10)
        B=miolo&(np.abs(hp3)>np.percentile(np.abs(hp3[miolo]),92));ii,jj=np.where(B);x,z=X[jj],Z[ii]
        perto_=np.hypot(x-lado*.215,z-.63)<.04;x,z=x[perto_],z[perto_];e=conica(x,z)
        for _ in range(5):r=np.abs(elipse(e,x,z));fica=r<np.percentile(r,80);e=conica(x[fica],z[fica])
        els.append(e)
    # o mesmo oval nos dois, espelhado: mesmos semieixos e altura, centros simétricos, ângulo de um = 180 graus menos o do outro
    a=(els[0][2]+els[1][2])/2;b=(els[0][3]+els[1][3])/2;cz=(els[0][1]+els[1][1])/2;cx=(els[1][0]-els[0][0])/2
    t=(els[0][4]%np.pi+np.pi-els[1][4]%np.pi)/2
    out=[[-cx,cz,a,b,t],[cx,cz,a,b,np.pi-t]]
    for e in out:print('BRILHO centro (%+.4f, %.4f) semieixos %.4f x %.4f, %.1f graus'%(e[0],e[1],e[2],e[3],np.degrees(e[4])),flush=True)
    return out

def corte(bm,fn,faces,mat,layers,domain=None):
    """cut() do macaco, levando junto os valores das camadas para os vértices novos (os cortes seguintes usam)"""
    val={}
    for f in faces:
        for v in f.verts:
            if v not in val:x=fn(v);val[v]=x if abs(x)>=1e-12 else 1e-12
    bm.edges.index_update();zero=[]
    for e in sorted({e for f in faces for e in f.edges},key=lambda e:e.index):
        a,b=e.verts
        if (val[a]<0)!=(val[b]<0):
            t=val[a]/(val[a]-val[b]);p=a.co.lerp(b.co,t);ka=[a[l] for l in layers];kb=[b[l] for l in layers]
            _,nv=bmesh.utils.edge_split(e,a,t);nv.co=p;val[nv]=0.0;zero.append(nv)
            for l,va,vb in zip(layers,ka,kb):nv[l]=va+t*(vb-va)
    zs_=set(zero)
    for f in list(dict.fromkeys(f for v in zero for f in v.link_faces)):
        if not f.is_valid:continue
        zs=[v for v in f.verts if v in zs_]
        if len(zs)!=2:continue
        a,b=zs
        if any(b in e.verts for e in a.link_edges if f in e.link_faces):continue
        try:bmesh.utils.face_split(f,a,b)
        except Exception:pass
    n=0
    for f in bm.faces:
        vals=[val.get(v) for v in f.verts]
        if None in vals or (domain is not None and not domain(f)):continue
        if all(x<=0 for x in vals) and min(vals)<0:f.material_index=mat;n+=1
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    return n

def colorir(obj,L,E,deg,els):
    me=obj.data;n=len(me.vertices)
    for nome in NAMES:
        rgb,rough=PALETTE[nome];c=np.array([int(rgb[i:i+2],16)/255 for i in (0,2,4)]);c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
        mat=bpy.data.materials.new(nome);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=0
        me.materials.append(mat)
    for p in me.polygons:p.material_index=BODY
    bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table();layers=[]
    for parte in (DETAILS,EYES,TEETH):
        # o contorno: a metade de cada parte, alisada 4 passadas (a borda fica lisa, sem os degraus dos vértices)
        s=media((L==parte).astype(float),E,n,deg,4);l=bm.verts.layers.float.new(NAMES[parte])
        for v in bm.verts:v[l]=s[v.index]
        layers.append(l)
    for parte,l in zip((DETAILS,EYES,TEETH),layers):
        k=corte(bm,lambda v,l=l:.5-v[l],list(bm.faces),parte,layers);print('CORTE %-8s %6d faces'%(NAMES[parte],k),flush=True)
    olhos=[f for f in bm.faces if f.material_index==EYES and f.normal.y<.3]
    k=corte(bm,lambda v:min(elipse(e,v.co.x,v.co.z) for e in els),olhos,HIGH,layers,domain=lambda f:f.material_index==EYES)
    print('CORTE highlight %6d faces'%k,flush=True)
    for l in layers:bm.verts.layers.float.remove(l)
    bm.to_mesh(me);bm.free()

def exportar(obj,dst):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_materials='EXPORT')

a=sys.argv[sys.argv.index('--')+1:];src,dst=os.path.abspath(a[0]),os.path.abspath(a[1])
obj,N=importar(src)
L,E,deg=partes(obj.data,N)
for p in range(4):print('VÉRTICES %-8s %6d'%(NAMES[p],int((L==p).sum())),flush=True)
els=brilhos(obj)
colorir(obj,L,E,deg,els)
exportar(obj,dst)
print('PRONTO',len(obj.data.polygons),'faces;',os.path.getsize(dst),'bytes',flush=True)
