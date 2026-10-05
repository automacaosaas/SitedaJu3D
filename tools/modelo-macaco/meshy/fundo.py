# Fundo da placa da barriga: no Meshy a borda de baixo tem um dente (um bico para cima, perto do meio) e fendas que atravessam a parede
# entre a placa e o corpo (e, atrás da placa, um bolso). Nessa faixa a superfície é desenhada de novo: uma membrana presa à casca de fora
# medida em volta da faixa, mais o degrau da placa (~1 mm, como no resto da borda) e um sulco raso ao longo de uma curva lisa ajustada ao
# contorno de baixo (sem o dente). Ela entra como uma folha por cima: o que era casca de fora na faixa sai, o resto da parede (fendas,
# bolso) fica 1 mm abaixo dela, e a casca em volta é assentada na mesma superfície (sem degrau). A cor segue a curva.
from mathutils.geometry import delaunay_2d_cdt
def placa_fundo(obj,R,X,Z,C=(-0.0005,0.042),XZ=.15,Z0=-.705,Z1=-.575,DENTE=(-.065,.005),DEGRAU=.0009,SULCO=(.0012,.0012),BEIRA=.01):
    me=obj.data;P=Polar(C)
    # a curva: o z mais baixo da placa em cada coluna (fora do dente), polinômio de grau 4
    M=R['barriga'];xs,zs=[],[]
    for j,x in enumerate(X):
        if -XZ-.03<x<XZ+.03 and not DENTE[0]<x<DENTE[1]:
            ii=np.where(M[:,j])[0]
            if len(ii):xs.append(x);zs.append(Z[ii].min())
    xs=np.array(xs);wt=np.where(np.abs(xs)>XZ-.02,6.,1.)             # nas pontas a curva passa pelo contorno velho (emenda com o resto)
    cf=np.polyfit(xs,zs,4,w=wt);dcf=np.polyder(cf);res=np.array(zs)-np.polyval(cf,xs)
    def sd(x,z):return (z-np.polyval(cf,x))/np.sqrt(1+np.polyval(dcf,x)**2)       # > 0 dentro da placa (acima da curva)
    def degrau(s):t=np.clip((s+.0015)/.003,0,1);return DEGRAU*t*t*(3-2*t)
    def sulco(s):return -SULCO[0]*np.exp(-(s/SULCO[1])**2)
    # a faixa no plano (ângulo x altura): |x| < XZ vira um intervalo de ângulo na casca (raio ~0,357)
    T0,T1=np.arcsin((-XZ-C[0])/.357),np.arcsin((XZ-C[0])/.357)
    bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm)
    def casca(t,z):
        h=hits(tree,(C[0],C[1],z),P.dir(t),1.)
        return P.radius(h[-1][0]) if h and P.radius(h[-1][0])>.345 else np.nan
    # a membrana numa grade: presa à casca medida numa beira de 1 cm em volta da faixa (sem o degrau), solta dentro
    dT=.0012/.357;GT=np.arange(T0-BEIRA/.357,T1+BEIRA/.357+dT/2,dT);GZ=np.arange(Z0-BEIRA,Z1+BEIRA+.0006,.0012)
    xg=C[0]+.357*np.sin(GT);SD=sd(xg[:,None],GZ[None,:]);RG=np.full((len(GT),len(GZ)),np.nan)
    for i,t in enumerate(GT):
        for j,z in enumerate(GZ):
            if T0<=t<=T1 and Z0<=z<=Z1:continue
            r=casca(t,z)
            if np.isfinite(r):RG[i,j]=r-degrau(SD[i,j])
    known=np.isfinite(RG);RG[~known]=np.nanmedian(RG)
    for it in range(4000):
        av=RG.copy();av[1:-1,1:-1]=(RG[2:,1:-1]+RG[:-2,1:-1]+RG[1:-1,2:]+RG[1:-1,:-2])/4;RG=np.where(known,RG,av)
    def rdes(t,z):
        fi=np.clip((t-GT[0])/dT,0,len(GT)-1.001);fj=np.clip((z-GZ[0])/.0012,0,len(GZ)-1.001);i,j=int(fi),int(fj);a,b=fi-i,fj-j
        base=RG[i,j]*(1-a)*(1-b)+RG[i+1,j]*a*(1-b)+RG[i,j+1]*(1-a)*b+RG[i+1,j+1]*a*b
        s=sd(C[0]+.357*np.sin(t),z);return float(base+degrau(s)+sulco(s))
    na_faixa=lambda t,z:T0<=t<=T1 and Z0<=z<=Z1
    # a parede antiga na faixa: a casca de fora é cortada nas quatro divisas da faixa (as faces do Meshy ali chegam a vários cm) e o que
    # fica dentro sai (até 6 mm abaixo da superfície nova)
    perto=lambda co:co.y<-.1 and T0-.04<P.theta(co)<T1+.04 and Z0-.015<co.z<Z1+.015 and P.radius(co)>.335
    for co_,no_ in (((0,0,Z0),(0,0,1)),((0,0,Z1),(0,0,1)),((C[0],C[1],0),(-np.cos(T0),-np.sin(T0),0)),((C[0],C[1],0),(-np.cos(T1),-np.sin(T1),0))):
        fs_=[f for f in bm.faces if any(perto(v.co) for v in f.verts) and all(v.co.y<-.05 and P.radius(v.co)>.335 for v in f.verts)]
        geom=list({e for f in fs_ for e in f.edges})+list({v for f in fs_ for v in f.verts})+fs_
        bmesh.ops.bisect_plane(bm,geom=geom,dist=1e-7,plane_co=co_,plane_no=no_)
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    tol=lambda co:co.y<-.1 and T0-1e-6<=P.theta(co)<=T1+1e-6 and Z0-1e-6<=co.z<=Z1+1e-6
    bm.faces.index_update();sai=[]
    for f in bm.faces:
        if all(tol(v.co) and P.radius(v.co)>rdes(P.theta(v.co),v.co.z)-.006 for v in f.verts):sai.append(f)
    bmesh.ops.delete(bm,geom=sai,context='FACES');bm.verts.ensure_lookup_table()
    # a casca em volta (1 cm) tem triângulos grandes, que não acompanham a superfície nova: as arestas de mais de 3 mm são partidas
    em_volta=lambda co:co.y<-.1 and T0-BEIRA/.357<P.theta(co)<T1+BEIRA/.357 and Z0-BEIRA<co.z<Z1+BEIRA and P.radius(co)>.345
    for it in range(4):
        bm.edges.index_update()
        ed_=sorted((e for e in bm.edges if e.calc_length()>.003 and em_volta(e.verts[0].co) and em_volta(e.verts[1].co) and e.link_faces),key=lambda e:e.index)
        if not ed_:break
        bmesh.ops.subdivide_edges(bm,edges=ed_,cuts=1);bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    bm.verts.ensure_lookup_table()
    nb=0;na=0
    for v in bm.verts:
        if v.co.y>-.1 or not v.link_faces:continue
        t,z=P.theta(v.co),v.co.z;r=P.radius(v.co)
        if r<.3:continue
        if T0+1e-5<t<T1-1e-5 and Z0+1e-5<z<Z1-1e-5:     # dentro de verdade (os vértices do corte, na divisa, vão para a superfície)
            rd=rdes(t,z)                       # o que sobrou da parede dentro da faixa (fendas, bolso) fica 1 mm abaixo da folha
            if r>rd-.001:P.put(v,rd-.001,t);nb+=1
        elif T0-BEIRA/.357<t<T1+BEIRA/.357 and Z0-BEIRA<z<Z1+BEIRA:
            rd=rdes(t,z)
            if abs(r-rd)<.003:       # a casca em volta: vai para a superfície nova, sumindo em 1 cm
                d=max((T0-t)*.357,(t-T1)*.357,Z0-z,z-Z1,0.);w=1-d/BEIRA;w=w*w*(3-2*w);P.put(v,r+(rd-r)*w,t);na+=1
    # a folha: no plano, triângulos de 2 mm (0,6 mm perto da curva), 2 mm além da faixa (por baixo da beira da casca que ficou, que está
    # na mesma superfície): na faixa ela fica na superfície; além dela desce 0,15 mm, para baixo da casca (sem cruzar com ela)
    E_=.002/.357;cant=[((T0-E_)*.357,Z0-.002),((T1+E_)*.357,Z0-.002),((T1+E_)*.357,Z1+.002),((T0-E_)*.357,Z1+.002)];B2=[]
    for k in range(4):                       # a volta de fora também com pontos a cada 2 mm (lados longos cortariam a curva ou viram lascas)
        a_,b_=np.array(cant[k]),np.array(cant[(k+1)%4]);m=max(2,int(np.ceil(np.linalg.norm(b_-a_)/.002)))
        B2+=[a_+(b_-a_)*q/m for q in range(m)]
    B2=np.array(B2);n=len(B2)
    pts=[]
    for S_,cond in ((.002,lambda s:np.abs(s)>=.005),(.0006,lambda s:np.abs(s)<.005)):
        gx,gz=np.meshgrid(np.arange(cant[0][0]+S_/2,cant[1][0]-S_/4,S_),np.arange(cant[0][1]+S_/2,cant[2][1]-S_/4,S_));Gp=np.c_[gx.ravel(),gz.ravel()]
        pts.append(Gp[cond(sd(C[0]+.357*np.sin(Gp[:,0]/.357),Gp[:,1]))])
    # a divisa da faixa entra como aresta obrigatória: nenhum triângulo a atravessa (a folha só desce fora dela)
    cant=[(T0*.357,Z0),(T1*.357,Z0),(T1*.357,Z1),(T0*.357,Z1)];I2=[]
    for k in range(4):                       # pontos a cada 1 mm na divisa (uma aresta só, de canto a canto, cortaria a curva)
        a_,b_=np.array(cant[k]),np.array(cant[(k+1)%4]);m=max(2,int(np.ceil(np.linalg.norm(b_-a_)/.001)))
        I2+=[a_+(b_-a_)*q/m for q in range(m)]
    I2=np.array(I2);nI=len(I2)
    Gp=np.concatenate(pts)
    dI=np.minimum(np.minimum(np.abs(Gp[:,0]-T0*.357),np.abs(Gp[:,0]-T1*.357)),np.minimum(np.abs(Gp[:,1]-Z0),np.abs(Gp[:,1]-Z1)))
    Gp=Gp[dI>.0004]
    out_=delaunay_2d_cdt([Vector(p) for p in B2]+[Vector(p) for p in I2]+[Vector(p) for p in Gp],
                         [(i,(i+1)%n) for i in range(n)]+[(n+i,n+(i+1)%nI) for i in range(nI)],[list(range(n))],1,1e-9)
    vco,tris=out_[0],out_[2];lay=bm.faces.layers.int.new('fundo');vm=[]
    for co in vco:
        t,z=co[0]/.357,co[1];d=max((T0-t)*.357,(t-T1)*.357,Z0-z,z-Z1,0.);r=rdes(t,z)-(.00015 if d>1e-6 else 0.)     # na faixa, na superfície; além dela, por baixo da casca
        vm.append(bm.verts.new((C[0]+r*np.sin(t),C[1]-r*np.cos(t),z)))
    nf=0
    for tri in tris:
        f=bm.faces.new([vm[i] for i in tri]);f.material_index=FUR;f.smooth=True;f[lay]=1;f.normal_update()
        if f.normal.dot(P.dir(P.theta(f.calc_center_median())))<0:f.normal_flip()
        nf+=1
    bm.faces.ensure_lookup_table()
    k=cut(bm,None,[f for f in bm.faces if f[lay]],FACE,domain=lambda f:f[lay]==1,fnv=lambda v:-sd(v.co.x,v.co.z))
    bm.faces.layers.int.remove(lay);bm.normal_update();bm.to_mesh(me);bm.free();me.update()
    print('FUNDO da placa: curva de grau 4 (desvio %.4f fora do dente); %d faces da casca velha saem, %d vértices abaixo, %d assentados em volta; folha de %d triângulos (%d bege)'
          %(res.std(),len(sai),nb,na,nf,k),flush=True)
