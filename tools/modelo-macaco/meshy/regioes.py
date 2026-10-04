# Regiões de cor tiradas do relevo, num mapa de profundidade visto de frente (o modelo do Meshy não tem textura). Cada parte é a área
# fechada pelo sulco em volta dela, achada a partir de um ponto dentro dela (sementes em x, z).
from collections import deque
SEMENTES={'placa':[(0,.68),(-.06,.47),(.06,.47)],'orelhas':[(-.45,.72),(.45,.72)],'barriga':[(0,-.15)],      # placa: a testa e o focinho
          'olhos':[(-.132,.60),(.132,.60)],'sobrancelhas':[(-.14,.746),(.14,.746)],'nariz':[(0,.54)],'banana':[(-.092,-.425)]}
# relevos finos, achados pelo que sobe numa escala de 7 mm: o nariz traz junto o risco e a boca; o focinho, uma cúpula larga, não sobe
ELEVADOS=('sobrancelhas','nariz')
def mapa_frente(obj,S=.0012):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm);bm.free()
    X=np.arange(-.62,.62,S);Z=np.arange(-.955,.955,S);Y=np.full((len(Z),len(X)),np.nan)
    for j,x in enumerate(X):
        for i,z in enumerate(Z):
            loc=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)[0]
            if loc:Y[i,j]=loc.y
    return X,Z,Y
def bfs(M,seed,lim=None):
    """células de M ligadas à semente (4 vizinhas)"""
    out=np.zeros(M.shape,bool)
    if not M[seed]:return out
    q=deque([seed]);out[seed]=True;n=0
    while q:
        i,j=q.popleft();n+=1
        if lim and n>lim:break
        for a,b in ((i+1,j),(i-1,j),(i,j+1),(i,j-1)):
            if 0<=a<M.shape[0] and 0<=b<M.shape[1] and M[a,b] and not out[a,b]:out[a,b]=True;q.append((a,b))
    return out
def tapar_furos(R):
    """R mais o que ele cerca (dentro da caixa dele)"""
    ii,jj=np.where(R);i0,i1,j0,j1=ii.min(),ii.max()+1,jj.min(),jj.max()+1;sub=~R[i0:i1,j0:j1];h,w=sub.shape
    fora=np.zeros(sub.shape,bool);q=deque()
    for i in range(h):
        for j in (0,w-1):
            if sub[i,j] and not fora[i,j]:fora[i,j]=True;q.append((i,j))
    for j in range(w):
        for i in (0,h-1):
            if sub[i,j] and not fora[i,j]:fora[i,j]=True;q.append((i,j))
    while q:
        i,j=q.popleft()
        for a,b in ((i+1,j),(i-1,j),(i,j+1),(i,j-1)):
            if 0<=a<h and 0<=b<w and sub[a,b] and not fora[a,b]:fora[a,b]=True;q.append((a,b))
    out=R.copy();out[i0:i1,j0:j1]|=sub&~fora;return out
def perto(M,c,r=7):
    """a célula de M mais perto de c (até r células)"""
    if M[c]:return c
    best=None
    for di in range(-r,r+1):
        for dj in range(-r,r+1):
            a,b=c[0]+di,c[1]+dj
            if 0<=a<M.shape[0] and 0<=b<M.shape[1] and M[a,b] and (best is None or di*di+dj*dj<best[0]):best=(di*di+dj*dj,(a,b))
    return best[1] if best else None
def encolher(M,n):
    for it in range(n):M=M&np.roll(M,1,0)&np.roll(M,-1,0)&np.roll(M,1,1)&np.roll(M,-1,1)
    return M
def regioes(X,Z,Y,G_THR=.0006,F_THR=.0008):
    from util import blur
    ok=np.isfinite(Y);hp=-(Y-blur(Y,8));G=(hp<-G_THR)|~ok;livre=~G&ok
    hp6=-(Y-blur(Y,6));alto=(hp6>F_THR)&ok;hp3=-(Y-blur(Y,3))
    cell=lambda x,z:(int(round((z-Z[0])/(Z[1]-Z[0]))),int(round((x-X[0])/(X[1]-X[0]))))
    R={}
    for k,ss in SEMENTES.items():
        M=alto if k in ELEVADOS else livre;m=np.zeros(Y.shape,bool)
        for x,z in ss:
            c=perto(M,cell(x,z))
            if c is None:print('REGIAO aviso: nada de %s perto de (%.3f, %.3f)'%(k,x,z),flush=True);continue
            m|=bfs(M,c,lim=200000)
        R[k]=m
    # o brilho de cada olho: a mancha que sobe (escala de 3,6 mm) no miolo do olho, sem encostar na beira (a beira da cúpula também sobe)
    R['brilho']=np.zeros(Y.shape,bool);cand=encolher(R['olhos'],5)&(hp3>.0004);vis=np.zeros(Y.shape,bool)
    for c in zip(*np.where(cand)):
        if vis[c]:continue
        comp=bfs(cand,c);vis|=comp
        ii,jj=np.where(comp)
        if 40<comp.sum()<3000 and np.ptp(ii)<.5*np.ptp(np.where(R["olhos"])[0]) and np.ptp(jj)<.25*np.ptp(np.where(R["olhos"])[1]):R["brilho"]|=comp      # mancha pequena (o anel da beira é do tamanho do olho)
    # o brilho e o nariz têm o miolo chato (não sobe na escala fina): entra o que eles cercam
    for k in ("placa","barriga","nariz"):R[k]=tapar_furos(R[k])
    vis=np.zeros(Y.shape,bool);b=R["brilho"].copy()
    for c in zip(*np.where(b)):
        if vis[c]:continue
        comp=bfs(b,c);vis|=comp;R["brilho"]|=tapar_furos(comp)
    return R,hp,G
