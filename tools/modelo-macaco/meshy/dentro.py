# Por dentro liso: o oco tinha o avesso da placa da barriga (um bolso de ~2 cm) e ondas de alguns milímetros. O oco não é redondo: o
# raio ondula ±6 mm em volta, com o mesmo desenho em toda a altura. Esse desenho, A(theta), sai das alturas sem bolso (embaixo da
# barriga e na cabeça); em cada altura entra só um ajuste de raio e de centro (3 termos, sem os pontos longe: o bolso, as bordas),
# suavizado na altura. Cada vértice visto do eixo vai para essa superfície (some aos poucos perto da abertura de trás, do pé e da borda
# de cima). As paredes do bolso, achatadas, viram arestas de comprimento zero e são dissolvidas.
def dentro_liso(obj,C=(-0.0005,0.042),ZTOP=.86,TSLOT=146,LIMPAS=((-.90,-.70),(.30,.75))):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm);P=Polar(C)
    V=np.array([v.co for v in bm.verts]);zmin=float(V[:,2].min())
    TH=np.radians(np.arange(-180,180,1.));Z=np.arange(zmin+.004,ZTOP+.02,.004);RI=np.full((len(Z),len(TH)),np.nan)
    for j,t in enumerate(TH):
        d=P.dir(t)
        for i,z in enumerate(Z):
            h=hits(tree,(C[0],C[1],z),d,1.,1)
            if h and h[0][1].dot(d)<0:RI[i,j]=P.radius(h[0][0])
    use=np.abs(np.degrees(TH))<TSLOT-8
    limpa=np.zeros(len(Z),bool)
    for a_,b_ in LIMPAS:limpa|=(Z>a_)&(Z<b_)
    D_=RI[limpa][:,use];D_=D_-np.nanmedian(D_,axis=1,keepdims=True);A=np.zeros(len(TH));A[use]=np.nanmedian(D_,axis=0)
    g3=np.exp(-.5*(np.arange(-9,10)/3.)**2);g3/=g3.sum();Au=A[use];A[use]=np.convolve(np.pad(Au,9,mode='edge'),g3,'same')[9:-9]
    Afn=lambda t:np.interp(t,TH,A,period=2*np.pi)
    F=lambda t:np.stack([np.ones_like(t),np.cos(t),np.sin(t)],-1)
    COEF=np.full((len(Z),3),np.nan)
    for i in range(len(Z)):
        m=use&np.isfinite(RI[i])
        if m.sum()<60:continue
        t0,r0=TH[m],RI[i,m]-A[m];c=np.array([np.median(r0),0.,0.])
        for it in range(8):
            keep=np.abs(r0-F(t0)@c)<.002
            if keep.sum()<20:break
            c=np.linalg.lstsq(F(t0[keep]),r0[keep],rcond=None)[0]
        COEF[i]=c
    ok=np.isfinite(COEF[:,0])
    for k in range(3):COEF[:,k]=np.interp(Z,Z[ok],COEF[ok,k])
    g=np.exp(-.5*(np.arange(-6,7)/3.)**2);g/=g.sum()
    COEF=np.stack([np.convolve(np.pad(COEF[:,k],6,mode='edge'),g,'same')[6:-6] for k in range(3)],1)
    def rif(t,z):
        c=np.array([np.interp(z,Z,COEF[:,k]) for k in range(3)]);return float(F(np.array(t))@c+Afn(t))
    dev=[];k=0;mx=0.
    for v in bm.verts:
        z=v.co.z;r=P.radius(v.co)
        if z>ZTOP+.01 or r>.36:continue
        t=P.theta(v.co);d=P.dir(t);h=hits(tree,(C[0],C[1],z),d,1.,1)
        if not h or abs(P.radius(h[0][0])-r)>.0015:continue          # só o que se vê do eixo
        if r-rif(t,z)>.03:continue                                   # o fundo das frestas que atravessam a parede fica (a forra cobre)
        w=min(1.,max(0.,(TSLOT-abs(np.degrees(t)))/8))*min(1.,max(0.,(z-zmin-.008)/.02))*min(1.,max(0.,(ZTOP-z)/.03))
        if w<=0:continue
        tr=rif(t,z);dev.append(r-tr);nr=r+(tr-r)*w;mx=max(mx,abs(nr-r));P.put(v,nr,t);k+=1
    dev=np.array(dev)
    n0=len(bm.faces);bmesh.ops.dissolve_degenerate(bm,edges=bm.edges[:],dist=2e-4);n1=len(bm.faces)
    # forra: uma folha lisa na superfície ajustada, 0,2 mm para dentro, onde o oco é todo liso (cobre vincos e frestas que sobraram)
    T_=np.radians(np.linspace(-(TSLOT-8),TSLOT-8,93));Z_=np.linspace(zmin+.03,ZTOP-.03,146);G=[]
    for t in T_:
        G.append([bm.verts.new((C[0]+(r_:=rif(t,z)-.0002)*np.sin(t),C[1]-r_*np.cos(t),z)) for z in Z_])
    forra=[]
    for i in range(len(T_)-1):
        for j in range(len(Z_)-1):
            f=bm.faces.new((G[i][j],G[i][j+1],G[i+1][j+1],G[i+1][j]));f.smooth=True;forra.append(f)
    for f in forra:
        f.normal_update()
        c=f.calc_center_median()
        if f.normal.dot(Vector((c.x-C[0],c.y-C[1],0)))>0:f.normal_flip()      # virada para o eixo
    bm.to_mesh(me);bm.free();me.update()
    print('DENTRO liso: %d vértices na superfície ajustada (afastados até %.4f; antes: p1 %.4f p99 %.4f), %d faces degeneradas dissolvidas; forra de %d faces'%(k,mx,np.percentile(dev,1),np.percentile(dev,99),n0-n1,len(forra)),flush=True)
    return rif
