"""Macaquinho colorido SEM textura (como pede o VITRINE-AVIAO-MACACO-QA.md do Luiz): a cor de cada face vem da textura do Rodin,
classificada em cinco materiais lisos -- fur (marrom), face (bege), features (preto: olhos, nariz, boca, sobrancelhas),
banana (amarelo) e highlight (brilho branco dos olhos). Nenhum se chama body/details/engines, então nada fica colorível no site.
Sem texturas o site não precisa buscar imagens por blob: (a CSP do site bloqueia isso em connect-src).
Fonte: o GLB do Rodin (`rodin-v2_-0 (7).glb`, recebido em 01/10/2026: malha de 500 mil triângulos com textura de cor 2048²).
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
    w[(np.abs(np.abs(V0[:,0])-.15)<.075)&(V0[:,2]<-.6)&(V0[:,1]<-.2)]=0       # patinhas
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
# Placa do rosto. A textura pinta a parede do sulco em volta do rosto num marrom-claro igual ao bege na sombra, então a cor
# não decide sozinha. A geometria decide: enche a partir de pontos da placa (testa, bochechas e focinho) sem atravessar
# dobras côncavas acima de 10 graus (o fundo do sulco). Dentro: bege (os detalhes pretos ficam); fora, na frente da cabeça: marrom.
from collections import deque
bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table();bm.edges.ensure_lookup_table()
cen3=np.array([f.calc_center_median() for f in bm.faces])
ang=np.array([e.calc_face_angle_signed() if len(e.link_faces)==2 else 0 for e in bm.edges]);lim=-np.radians(10)
plate=np.zeros(nf,bool)
for sx,sz in [(-.12,.47),(.12,.47),(0,.68),(-.1,.62),(.1,.62),(0,.38),(-.07,.40),(.07,.40)]:
    cand=np.where((cls==1)&(cen3[:,1]<-.2))[0];seed=cand[np.argmin(np.hypot(cen3[cand,0]-sx,cen3[cand,2]-sz))]
    seen=np.zeros(nf,bool);seen[seed]=True;q=deque([seed])
    while q:
        for e in bm.faces[q.popleft()].edges:
            if len(e.link_faces)!=2 or ang[e.index]<lim:continue
            for g in e.link_faces:
                if not seen[g.index]:seen[g.index]=True;q.append(g.index)
    ok=seen.sum()<40000 and cen3[seen,2].min()>.25 and np.abs(cen3[seen,0]).max()<.32
    print('PLACA semente',(sx,sz),int(seen.sum()),'faces','ok' if ok else 'VAZOU, ignorada',flush=True)
    if ok:plate|=seen
head=(np.abs(cen3[:,0])<.30)&(cen3[:,1]<-.15)&(cen3[:,2]>.30)
inside=plate&(cls==0);outside=head&~plate&(cls==1)
cls[inside]=1;cls[outside]=0
print('PLACA',int(plate.sum()),'faces; marrom->bege',int(inside.sum()),'; bege fora da placa->marrom',int(outside.sum()),flush=True)
# Barriga: o mesmo critério do rosto (a textura deixava fiapos marrons na borda). Enche a partir de pontos da barriga até o sulco
# em volta dela; dentro: bege (a banana e as mãos, que têm a própria base, ficam); fora, na frente do corpo: marrom.
belly=np.zeros(nf,bool)
for sx,sz in [(0,-.5),(0,-.05),(0,.12),(-.08,-.45),(.08,-.45),(-.08,0),(.08,0),(.1,-.3)]:
    cand=np.where((cls==1)&(cen3[:,1]<-.2)&(cen3[:,2]<.25))[0];seed=cand[np.argmin(np.hypot(cen3[cand,0]-sx,cen3[cand,2]-sz))]
    seen=np.zeros(nf,bool);seen[seed]=True;q=deque([seed])
    while q:
        for e in bm.faces[q.popleft()].edges:
            if len(e.link_faces)!=2 or ang[e.index]<lim:continue
            for g in e.link_faces:
                if not seen[g.index]:seen[g.index]=True;q.append(g.index)
    ok=seen.sum()<60000 and cen3[seen,2].max()<.3 and np.abs(cen3[seen,0]).max()<.25
    print('BARRIGA semente',(sx,sz),int(seen.sum()),'faces','ok' if ok else 'VAZOU, ignorada',flush=True)
    if ok:belly|=seen
bm.free()
box=(np.abs(cen3[:,0])<.25)&(cen3[:,1]<-.15)&(cen3[:,2]>-.7)&(cen3[:,2]<.28)
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
for ex,sx in [(-.137,1),(.117,-1)]:
    comp=grow([nearest(cls==2,ex,.59)],cls==2)
    p=cen3[comp];x0,x1,z0,z1=p[:,0].min(),p[:,0].max(),p[:,2].min(),p[:,2].max()
    zone=(cen3[:,0]>x0-.02)&(cen3[:,0]<x1+.02)&(cen3[:,2]>z0-.02)&(cen3[:,2]<z1+.02)&(cen3[:,1]<-.05)
    edge=[i for i in np.where(zone&~comp)[0] if any(not zone[g] for g in nbr[i])]
    outside=grow(edge,zone&~comp);eye=comp|(zone&~outside)
    cls[eye]=2;cx,cz=(x0+x1)/2,(z0+z1)/2;hx,hz=cx+sx*.005,cz+.031
    shine=eye&(((cen3[:,0]-hx)/.012)**2+((cen3[:,2]-hz)/.019)**2<1);cls[shine]=4
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
# Orelhas: a concha é plana e virada para a frente; a borda sobe em volta. Bege = a parte plana ligada ao centro da concha
# (normal a menos de 22 graus da normal da concha), com o contorno alisado; marrom = a borda e o resto. Mesmo critério nas duas.
for ex,ez in [(-.398,.703),(.377,.681)]:
    zone=(np.abs(cen3[:,0]-ex)<.16)&(np.abs(cen3[:,2]-ez)<.16)&(np.abs(cen3[:,0])>.28)&(cen3[:,1]<.05)
    core=zone&(np.hypot(cen3[:,0]-ex,cen3[:,2]-ez)<.03)&(cls==1)
    ne=nrm3[core].mean(0);ne/=np.linalg.norm(ne)
    flat=zone&(nrm3@ne>np.cos(np.radians(22)))
    bowl=grow(list(np.where(core&flat)[0]),flat)
    for it in range(3):
        v=np.where(nb>=0,bowl[np.maximum(nb,0)],False).sum(1);c=(nb>=0).sum(1)
        bowl=zone&np.where(2*v>c,True,np.where(2*v<c,False,bowl))
    cls[zone&bowl]=1;cls[zone&~bowl&(cls==1)]=0
    print('ORELHA',ex,'concha',int(bowl.sum()),'faces',flush=True)
bm.free()
for k in range(5):
    root=components(cls)[cls==k];_,s=np.unique(root,return_counts=True);s=np.sort(s)[::-1]
    print('REGIOES',NAMES[k],len(s),'maiores',s[:8].tolist(),flush=True)

# cor e rugosidade de cada material: mediana das amostras centrais das faces daquela classe
cc=at(col,w,h,cen);mm=at(mr,mw,mh,cen)
def lin(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
me.materials.clear()
for i,n in enumerate(NAMES):
    sel=cls==i;srgb=np.median(cc[sel],0) if sel.any() else np.array([1,1,1.])
    rough=float(np.median(mm[sel][:,1])) if sel.any() else .5;metal=float(np.median(mm[sel][:,2])) if sel.any() else 0
    mat=bpy.data.materials.new(n);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*lin(srgb),1);bs.inputs['Roughness'].default_value=min(max(rough,.25),.85);bs.inputs['Metallic'].default_value=0
    me.materials.append(mat)
    print('MAT',n,int(sel.sum()),'faces sRGB',tuple(np.round(srgb*255).astype(int)),'rough %.2f metal(orig) %.2f'%(rough,metal),flush=True)
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
def cut(bm,fn,faces,inside_mat,domain=None):
    """Parte as faces ao longo de fn==0 (fn<0 é dentro) e pinta de inside_mat as que ficam inteiras dentro."""
    val={}
    for f in faces:
        for v in f.verts:
            if v not in val:x=fn(v.co);val[v]=x if abs(x)>=1e-12 else 1e-12
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
def connected(bm,start,ok):
    seen={start};q=deque([start])
    while q:
        for e in q.popleft().edges:
            for g in e.link_faces:
                if g not in seen and ok(g):seen.add(g);q.append(g)
    return seen
bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
# orelhas: plano da concha (mínimos quadrados nas faces bege do centro). Em cada direção a partir do centro, a concha vai até
# onde a borda começa a subir (profundidade sobre o plano acima de 3,8 milésimos); esse raio, suavizado entre direções
# vizinhas, é o contorno do bege. Assim o bege nunca passa para além da borda, e o contorno é liso.
for ex,ez in [(-.398,.703),(.377,.681)]:
    zf=[f for f in bm.faces if abs(f.calc_center_median().x-ex)<.16 and abs(f.calc_center_median().z-ez)<.16 and abs(f.calc_center_median().x)>.28 and f.calc_center_median().y<.05]
    core=[f for f in zf if f.material_index==FACE and np.hypot(f.calc_center_median().x-ex,f.calc_center_median().z-ez)<.035]
    P=np.array([f.calc_center_median() for f in core]);c=P.mean(0);n=np.linalg.svd(P-c)[2][2]
    if n[1]>0:n=-n
    u=np.cross([0,0,1.],n);u/=np.linalg.norm(u);w=np.cross(n,u)
    C,N,Uv,Wv=Vector(c),Vector(n),Vector(u),Vector(w)
    def polar(co):
        d=co-C;a,b=d.dot(Uv),d.dot(Wv);return np.hypot(a,b),np.arctan2(b,a),d.dot(N)
    vs={v for f in zf for v in f.verts if v.normal.dot(N)>.2}
    pr=np.array([polar(v.co) for v in vs]);pr=pr[np.abs(pr[:,2])<.05]
    nb_=72;R=np.zeros(nb_);bins=((pr[:,1]+np.pi)/(2*np.pi)*nb_).astype(int)%nb_
    for i in range(nb_):
        b=pr[bins==i];up=b[(b[:,2]>.0038)&(b[:,0]>.01)]
        R[i]=up[:,0].min() if len(up) else np.nan
    # direção sem borda medida (borda baixa demais): herda o raio das vizinhas, em vez de ir até a beirada da orelha
    ok=~np.isnan(R);idx=np.arange(nb_);R=np.interp(idx,np.concatenate([idx[ok]-nb_,idx[ok],idx[ok]+nb_]),np.concatenate([R[ok]]*3))
    print('ORELHA direcoes sem borda',int((~ok).sum()),'de',nb_,flush=True)
    R=np.array([np.median(np.take(R,range(i-3,i+4),mode='wrap')) for i in range(nb_)])     # tira picos isolados
    R=np.array([np.mean(np.take(R,range(i-2,i+3),mode='wrap')) for i in range(nb_)])       # e alisa
    th=(np.arange(nb_)+.5)/nb_*2*np.pi-np.pi
    def Rat(t):return float(np.interp(t,np.concatenate([th-2*np.pi,th,th+2*np.pi]),np.concatenate([R,R,R])))
    def fn(co):
        r,t,d=polar(co);return r-Rat(t)
    region=[f for f in zf if f.normal.dot(N)>-.2 and polar(f.calc_center_median())[0]<R.max()+.02 and abs(polar(f.calc_center_median())[2])<.03]
    for f in zf:
        if f.material_index==FACE:f.material_index=FUR
    for f in region:f.material_index=FUR
    k=cut(bm,fn,region,FACE);bm.faces.ensure_lookup_table()
    print('ORELHA LISA',ex,'raio da concha %.3f a %.3f'%(R.min(),R.max()),'regiao',len(region),'bege',k,flush=True)
# olhos: superfície do rosto em volta (quadrática, ajustada no anel ao redor) e altura do relevo sobre ela; o preto vai até a
# altura medida na borda atual do olho; o brilho é um oval no alto, espelhado entre os olhos
for ex,ez,sx,shine in [(-.137,.59,1,True),(.117,.59,-1,True)]:
    eyef=[f for f in bm.faces if f.material_index in (FEAT,HIGH) and abs(f.calc_center_median().x-ex)<.09 and abs(f.calc_center_median().z-ez)<.1 and f.calc_center_median().y<-.05]
    seed=min(eyef,key=lambda f:np.hypot(f.calc_center_median().x-ex,f.calc_center_median().z-ez))
    comp=connected(bm,seed,lambda g:g.material_index in (FEAT,HIGH))
    p=np.array([f.calc_center_median() for f in comp]);cx,cz=(p[:,0].min()+p[:,0].max())/2,(p[:,2].min()+p[:,2].max())/2
    ax,az=(p[:,0].max()-p[:,0].min())/2,(p[:,2].max()-p[:,2].min())/2
    ell=lambda co,s:((co.x-cx)/(ax*s))**2+((co.z-cz)/(az*s))**2
    ring=np.array([v.co for v in bm.verts if v.co.y<-.05 and 1.25<ell(v.co,1)<1.9**2 and v.normal.y<-.3])
    A=lambda q:np.stack([np.ones(len(q)),q[:,0],q[:,2],q[:,0]**2,q[:,2]**2,q[:,0]*q[:,2]],1)
    for it in range(3):
        coef=np.linalg.lstsq(A(ring),ring[:,1],rcond=None)[0];res=A(ring)@coef-ring[:,1];ring=ring[np.abs(res)<max(.002,3*res.std())]
    height=lambda co:float(A(np.array([co]))@coef-co.y)       # para a frente (y menor) é positivo
    border=[v.co for f in comp for v in f.verts if any(g.material_index not in (FEAT,HIGH) for g in v.link_faces)]
    h0=float(np.median([height(co) for co in border]))
    # só a superfície de fora do rosto (a parede de dentro da cabeça fica logo atrás dos olhos, na mesma altura)
    region=[f for f in bm.faces if f.calc_center_median().y<-.28 and ell(f.calc_center_median(),1)<1.35**2 and f.material_index in (FEAT,HIGH,FACE,FUR)]
    for f in region:f.material_index=FACE
    k=cut(bm,lambda co:h0-height(co),region,FEAT);bm.faces.ensure_lookup_table()
    hx,hz=cx+sx*.005,cz+.031
    # triângulos menores sob o brilho, para o oval sair redondo (subdividir não muda a forma)
    for it in range(2):
        sub=[f for f in bm.faces if f.material_index==FEAT and ((f.calc_center_median().x-hx)/.02)**2+((f.calc_center_median().z-hz)/.027)**2<1 and f.calc_center_median().y<-.05]
        bm.edges.index_update()
        bmesh.ops.subdivide_edges(bm,edges=sorted({e for f in sub for e in f.edges},key=lambda e:e.index),cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    eye=[f for f in bm.faces if f.material_index==FEAT and ell(f.calc_center_median(),1)<1.35**2 and f.calc_center_median().y<-.05]
    s=cut(bm,lambda co:((co.x-hx)/.012)**2+((co.z-hz)/.019)**2-1,eye,HIGH);bm.faces.ensure_lookup_table()
    print('OLHO LISO',ex,'altura da base %.4f'%h0,'preto',k,'brilho',s,'anel',len(ring),flush=True)
# patinhas (o relevo raso embaixo, na frente) na cor da pele. Centro de cada uma pelo relevo local (altura sobre a média larga em
# volta); numa área justa em volta dela (longe do sulco da barriga e da borda de baixo), a superfície do corpo é ajustada pela parte
# de baixo dos pontos e a patinha é o que se ergue acima dela, cortada a 35% da altura máxima.
A=lambda q:np.stack([np.ones(len(q)),q[:,0],q[:,2],q[:,0]**2,q[:,2]**2,q[:,0]*q[:,2]],1)
for side in (-1,1):
    out=lambda co,nr:(co.x-axis[0])*nr.x+(co.y-axis[1])*nr.y>0
    cand=[i for i,p in enumerate(_V) if side*p[0]>.05 and abs(p[0])<.25 and -.82<p[2]<-.64 and p[1]<-.15]
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
while me.uv_layers:me.uv_layers.remove(me.uv_layers[0])
for im in list(bpy.data.images):bpy.data.images.remove(im)
for mat in list(bpy.data.materials):
    if mat.users==0:bpy.data.materials.remove(mat)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_materials='EXPORT')
print('CORES',before,'->',nf,'faces;',os.path.getsize(dst),'bytes',flush=True)
