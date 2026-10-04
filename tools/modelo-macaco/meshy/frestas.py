# Frestas que atravessam a parede (a placa da barriga é quase solta do corpo: embaixo dela ficou uma fenda de ~3 mm, e há um ponto perto
# do sovaco esquerdo). Raios saindo do eixo passam por elas sem tocar em nada. Uma folha por fora, 0,5 mm abaixo do fundo do sulco em
# volta, cobre cada uma (as bordas dela ficam por baixo das beiradas da fenda).
def fechar_frestas(obj,C=(-0.0005,0.042),TSLOT=146,DT=.25,DZ=.0015):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm);P=Polar(C)
    V=np.array([v.co for v in bm.verts]);zmin,zmax=float(V[:,2].min()),float(V[:,2].max())
    TH=np.radians(np.arange(-TSLOT+2,TSLOT-2,DT));Z=np.arange(zmin+.01,zmax-.06,DZ)
    # varredura grossa primeiro (só onde precisa olhar de perto)
    cand=set()
    for j,t in enumerate(TH[::3]):
        d=P.dir(t)
        for i,z in enumerate(Z[::3]):
            if not hits(tree,(C[0],C[1],z),d,1.,1):cand.add((i,j))
    if not cand:print('FRESTAS nenhuma',flush=True);bm.free();return
    near=np.zeros((len(Z),len(TH)),bool)
    for i,j in cand:near[max(0,i*3-30):i*3+31,max(0,j*3-30):j*3+31]=True
    RO=np.full(near.shape,np.nan);thru=np.zeros(near.shape,bool)
    for i,j in zip(*np.where(near)):
        h=hits(tree,(C[0],C[1],Z[i]),P.dir(TH[j]),1.)
        if h:RO[i,j]=P.radius(h[-1][0])
        else:thru[i,j]=True
    dil=lambda M,n:[M:=M|np.roll(M,1,0)|np.roll(M,-1,0)|np.roll(M,1,1)|np.roll(M,-1,1) for _ in range(n)][-1] if n else M
    # perto delas, também os sulcos fundos (mais de 2 mm abaixo do lado baixo da superfície em volta): o entalhe na ponta da fenda
    ft=dil(thru.copy(),3);deep=np.zeros(RO.shape,bool)
    for i,j in zip(*np.where(near&np.isfinite(RO))):
        W=RO[max(0,i-12):i+13,max(0,j-12):j+13];F=ft[max(0,i-12):i+13,max(0,j-12):j+13];w=W[np.isfinite(W)&~F]
        if len(w)>10 and RO[i,j]<np.percentile(w,10)-.002:deep[i,j]=True
    # a folha: essas células e mais 6 em volta (do lado da placa ela fica por baixo da placa, que é mais alta)
    m=dil(thru|deep,6)
    # a altura da folha: o lado mais baixo da fenda (percentil 10 numa janela de ±12 células, sem a fenda e as beiradas), 0,6 mm abaixo:
    # a fenda vira o pé do degrau da placa, com o chão no nível do corpo
    far=m.copy()
    for it in range(3):far=far|np.roll(far,1,0)|np.roll(far,-1,0)|np.roll(far,1,1)|np.roll(far,-1,1)
    lo=np.full(RO.shape,np.nan)
    for i,j in zip(*np.where(m)):
        W=RO[max(0,i-12):i+13,max(0,j-12):j+13];F=far[max(0,i-12):i+13,max(0,j-12):j+13]
        w=W[np.isfinite(W)&~F]
        if len(w)>10:lo[i,j]=np.percentile(w,10)-.0006
    verts={};nf=0
    def vert(i,j):
        if (i,j) not in verts:
            r=min(lo[a,b] for a in (i-1,i) for b in (j-1,j) if 0<=a<lo.shape[0] and 0<=b<lo.shape[1] and m[a,b] and np.isfinite(lo[a,b]))
            t=TH[0]+(j-.5)*DT*np.pi/180;z=Z[0]+(i-.5)*DZ;verts[(i,j)]=bm.verts.new((C[0]+r*np.sin(t),C[1]-r*np.cos(t),z))
        return verts[(i,j)]
    for i,j in zip(*np.where(m)):
        if not np.isfinite(lo[i,j]):continue
        f=bm.faces.new((vert(i,j),vert(i,j+1),vert(i+1,j+1),vert(i+1,j)));f.smooth=True;f.normal_update();nf+=1
        c=f.calc_center_median()
        if f.normal.dot(Vector((c.x-C[0],c.y-C[1],0)))<0:f.normal_flip()          # virada para fora
    bm.to_mesh(me);bm.free();me.update()
    zz=Z[np.where(thru)[0]];tt=np.degrees(TH[np.where(thru)[1]])
    print("FRESTAS %d células atravessadas e %d de sulco fundo (z %.3f..%.3f, theta %.1f..%.1f); folha de %d faces"%(thru.sum(),deep.sum(),zz.min(),zz.max(),tt.min(),tt.max(),nf),flush=True)
