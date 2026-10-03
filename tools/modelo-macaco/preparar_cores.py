"""Macaquinho colorido SEM textura (como pede o VITRINE-AVIAO-MACACO-QA.md do Luiz): a cor de cada face vem da textura do Rodin,
classificada em cinco materiais lisos -- fur (marrom), face (bege), features (preto: olhos, nariz, boca, sobrancelhas),
banana (amarelo) e highlight (brilho branco dos olhos). Nenhum se chama body/details/engines, então nada fica colorível no site.
Sem texturas o site não precisa buscar imagens por blob: (a CSP do site bloqueia isso em connect-src).
Fonte: o GLB do Rodin (`rodin-v2_-0 (7).glb`, recebido em 01/10/2026: malha de 500 mil triângulos com textura de cor 2048²).
Uso: blender -b -P preparar_cores.py -- <rodin.glb> <saida.glb> 0.6     (0.6 = fica com 60% das faces; depois, meshopt como em PERFORMANCE-QA.md)
"""
import bpy,bmesh,os,sys,numpy as np
a=sys.argv[sys.argv.index('--')+1:]
src,dst=os.path.abspath(a[0]),os.path.abspath(a[1]);ratio=float(a[2])
SMOOTH,ISLAND,FEATURE_MIN=4,400,60
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=src)
obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='macacoscopio';me=obj.data
before=len(me.polygons)
# o importador do glTF separa os vértices nas costuras da UV; solda de volta (a UV fica nos cantos das faces) para a malha ser contínua
bm=bmesh.new();bm.from_mesh(me);n0=len(bm.verts);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6);print("SOLDA",n0,"->",len(bm.verts),flush=True);bm.to_mesh(me);bm.free()
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
bm.free()
head=(np.abs(cen3[:,0])<.30)&(cen3[:,1]<-.15)&(cen3[:,2]>.30)
inside=plate&(cls==0);outside=head&~plate&(cls==1)
cls[inside]=1;cls[outside]=0
print('PLACA',int(plate.sum()),'faces; marrom->bege',int(inside.sum()),'; bege fora da placa->marrom',int(outside.sum()),flush=True)
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
while me.uv_layers:me.uv_layers.remove(me.uv_layers[0])
for im in list(bpy.data.images):bpy.data.images.remove(im)
for mat in list(bpy.data.materials):
    if mat.users==0:bpy.data.materials.remove(mat)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_materials='EXPORT')
print('CORES',before,'->',nf,'faces;',os.path.getsize(dst),'bytes',flush=True)
