# Topo redondo: a borda de dentro da cabeça (que se curva para dentro até a abertura) vira uma superfície de revolução: cada vértice
# vai para o perfil médio da borda (mediana em todas as direções), em volta de um centro que passa do eixo do oco (embaixo) ao centro
# da abertura (em cima).
def circulo(P):
    M=np.c_[2*P,np.ones(len(P))];sol=np.linalg.lstsq(M,(P**2).sum(1),rcond=None)[0];c=sol[:2];return c,float(np.sqrt(sol[2]+c@c))
def topo_redondo(obj,Z0=.78,ZL=.85,RMAX=.315):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm)
    V=np.array([v.co for v in bm.verts]);zmax=float(V[:,2].max())
    def centro(z,c0=(0.,.04)):
        c=np.array(c0)
        for it in range(3):
            P=[]
            for a in np.linspace(0,2*np.pi,90,endpoint=False):
                h=hits(tree,(c[0],c[1],z),Vector((np.cos(a),np.sin(a),0)),1.,1)
                if h:P.append((h[0][0].x,h[0][0].y))
            c,R=circulo(np.array(P))
        return c,R
    cb,Rb=centro(Z0);zs=np.arange(Z0,zmax-.005,.005);cs=[]
    for z in zs:cs.append(centro(z,cb)[0])
    cs=np.array(cs)
    # o centro da abertura: o da altura onde o furo é mais estreito
    rmin=[centro(z,cb)[1] for z in zs];k=int(np.argmin(rmin));co=cs[k];zo=float(zs[k])
    print('TOPO oco em z %.3f: centro (%.4f, %.4f) raio %.4f; abertura em z %.3f: centro (%.4f, %.4f) raio %.4f'%(Z0,cb[0],cb[1],Rb,zo,co[0],co[1],rmin[k]),flush=True)
    def cz(z):s=np.clip((z-Z0)/(zo-Z0),0,1);s=s*s*(3-2*s);return cb*(1-s)+co*s
    # perfil (r,z) em coordenadas polares em volta de um ponto dentro da borda
    sel=[v for v in bm.verts if v.co.z>ZL and np.hypot(*(np.array(v.co[:2])-cz(v.co.z)))<RMAX]
    RZ=np.array([(np.hypot(*(np.array(v.co[:2])-cz(v.co.z))),v.co.z) for v in sel])
    P0=np.array([RMAX-.03,zo-.02])          # no meio da curva da borda: dali o perfil é visto uma vez só em cada direção
    phi=np.arctan2(RZ[:,1]-P0[1],RZ[:,0]-P0[0]);rho=np.hypot(RZ[:,1]-P0[1],RZ[:,0]-P0[0])
    B=np.radians(np.arange(-180,180.1,1.5));med=np.full(len(B)-1,np.nan)
    for i in range(len(B)-1):
        m=(phi>=B[i])&(phi<B[i+1])
        if m.sum()>=5:med[i]=np.median(rho[m])
    ok=np.isfinite(med);mid=(B[:-1]+B[1:])/2;med=np.interp(mid,mid[ok],med[ok],period=2*np.pi)
    med=np.convolve(np.r_[med[-3:],med,med[:3]],np.ones(7)/7,'same')[3:-3]                  # perfil liso
    k2=0;mx=0.
    for v,(r,z),f,p in zip(sel,RZ,phi,rho):
        # some aos poucos perto dos limites da região (embaixo e na beira de fora do topo)
        w=min(1.,(z-ZL)/.025)*min(1.,(RMAX-r)/.015)
        if w<=0:continue
        target=np.interp(f,mid,med,period=2*np.pi);np_=p+(target-p)*w
        nr,nz=P0[0]+np_*np.cos(f),P0[1]+np_*np.sin(f);c=cz(nz);d=np.array(v.co[:2])-cz(z);d/=max(np.linalg.norm(d),1e-9)
        new=(c[0]+nr*d[0],c[1]+nr*d[1],nz);mx=max(mx,(Vector(new)-v.co).length);v.co=new;k2+=1
    bm.to_mesh(me);bm.free();me.update()
    print('TOPO redondo: %d vértices no perfil médio da borda (até %.4f), centro do perfil (%.4f, %.4f)'%(k2,mx,P0[0],P0[1]),flush=True)
