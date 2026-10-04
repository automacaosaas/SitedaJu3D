# Ombros sem o vão: no Meshy, em volta da raiz de cada braço, há um bolso de ~2,5 cm (o fundo a r 0,330, o corpo a 0,355). A raiz do
# braço e o bolso ficam por baixo de uma tampa com a forma da parede; a casca do corpo em volta é assentada na superfície medida em
# volta do bolso (sem degrau), como no ombro do modelo do Rodin.
def tampar_ombros(obj,center=(-0.0005,0.042),BOLSO=.345,CORPO=.37):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);tree=BVHTree.FromBMesh(bm);bm.free()
    def raios(t,z):
        d=Vector((np.sin(t),-np.cos(t),0));o=Vector((center[0],center[1],z));p=o.copy();rs=[]
        for _ in range(10):
            loc,n,i,dist=tree.ray_cast(p,d,1.0)
            if loc is None:break
            rs.append(float(np.hypot(loc.x-center[0],loc.y-center[1])));p=loc+d*1e-5
        return rs
    Qf=lambda t,z:np.stack([np.ones_like(t),t,z,t*t,z*z,t*z],-1)
    fechou=0
    for s in (-1,1):
        TH=np.radians(np.arange(85,140.01,.5))*s;ZS=np.arange(-.2,.2501,.005)
        gap=[(t,z) for t in TH for z in ZS if (rs:=raios(t,z)) and .31<rs[-1]<BOLSO]          # o fundo do bolso: o último toque bem abaixo do corpo
        if not gap:continue
        g=np.array(gap);ga,gb=np.abs(g[:,0]).min(),np.abs(g[:,0]).max();za,zb=g[:,1].min(),g[:,1].max()
        # as cascas em volta: atrás da fenda (qualquer altura) e acima/abaixo dela (longe da raiz do braço), com parede simples
        smp=[]
        for t in np.radians(np.arange(np.degrees(ga)-15,np.degrees(gb)+3.01,1)):
            for z in np.arange(za-.1,zb+.1001,.01):
                if t>=ga-np.radians(1) and za-.03<z<zb+.03:continue
                rs=raios(s*t,z)
                if len(rs)==2 and .27<rs[0]<rs[1]<CORPO and rs[1]>BOLSO:smp.append((t,z,rs[0],rs[1]))
        S_=np.array(smp);cin=np.linalg.lstsq(Qf(S_[:,0],S_[:,1]),S_[:,2],rcond=None)[0];cout=np.linalg.lstsq(Qf(S_[:,0],S_[:,1]),S_[:,3],rcond=None)[0]
        t0_,t1_=ga-np.radians(7),gb+np.radians(7);z0_,z1_=za-.03,zb+.03      # ga: o lado do braço (na frente)
        # a casca de fora medida numa grade em volta (último toque de cada raio); na tampa, no encaixe e sob o braço ela é refeita como
        # uma membrana lisa presa ao que foi medido em volta (Laplace na grade), partindo do ajuste
        GT=np.arange(t0_-.12,t1_+.1201,np.radians(.5));GZ=np.arange(z0_-.04,z1_+.0401,.004)
        RG=np.array([[float(Qf(np.array(t),np.array(z))@cout) for z in GZ] for t in GT]);known=np.zeros(RG.shape,bool)
        for i,t in enumerate(GT):
            for j,z in enumerate(GZ):
                if t0_<=t<=t1_ and z0_<=z<=z1_:continue
                rs=raios(s*t,z)
                if rs and BOLSO<rs[-1]<CORPO and abs(rs[-1]-RG[i,j])<.004:RG[i,j]=rs[-1];known[i,j]=True
        known[[0,-1],:]=True;known[:,[0,-1]]=True
        for it in range(3000):
            av=RG.copy();av[1:-1,1:-1]=(RG[2:,1:-1]+RG[:-2,1:-1]+RG[1:-1,2:]+RG[1:-1,:-2])/4;RG=np.where(known,RG,av)
        def rout(t,z):
            fi=np.clip((t-GT[0])/(GT[1]-GT[0]),0,len(GT)-1.001);fj=np.clip((z-GZ[0])/(GZ[1]-GZ[0]),0,len(GZ)-1.001);i,j=int(fi),int(fj);a,b=fi-i,fj-j
            return float(RG[i,j]*(1-a)*(1-b)+RG[i+1,j]*a*(1-b)+RG[i,j+1]*(1-a)*b+RG[i+1,j+1]*a*b)
        T_=np.linspace(t0_,t1_,max(8,int(np.degrees(t1_-t0_)/.5)));Z_=np.linspace(z0_,z1_,max(8,int((z1_-z0_)/.004)))
        bp=bmesh.new()
        def ring(off,rf):
            return [[bp.verts.new((center[0]+(r:=rf(t,z)+off)*np.sin(s*t),center[1]-r*np.cos(s*t),z)) for z in Z_] for t in T_]
        # a face de fora fica 0,1 mm abaixo da casca medida e desce devagar até 0,7 mm na borda (lá o corpo fica por cima); a de dentro,
        # no meio da parede
        def borda(t,z):return min(1.,max(0.,min((t-t0_)/.045,(t1_-t)/.045,(z-z0_)/.015,(z1_-z)/.015)))     # 0 na borda da tampa, 1 a 1,5 cm dentro
        O=ring(-.0001,lambda t,z:rout(t,z)-.0006*(1-borda(t,z))**2);I=ring(.010,lambda t,z:float(Qf(np.array(t),np.array(z))@cin));nt,nz_=len(T_),len(Z_)
        for i in range(nt-1):
            for j in range(nz_-1):
                bp.faces.new((O[i][j],O[i+1][j],O[i+1][j+1],O[i][j+1]));bp.faces.new((I[i][j],I[i][j+1],I[i+1][j+1],I[i+1][j]))
        for i in range(nt-1):bp.faces.new((O[i][0],I[i][0],I[i+1][0],O[i+1][0]));bp.faces.new((O[i][-1],O[i+1][-1],I[i+1][-1],I[i][-1]))
        for j in range(nz_-1):bp.faces.new((O[0][j],O[0][j+1],I[0][j+1],I[0][j]));bp.faces.new((O[-1][j],I[-1][j],I[-1][j+1],O[-1][j+1]))
        bmesh.ops.recalc_face_normals(bp,faces=bp.faces[:])
        pm=bpy.data.meshes.new('tampa');bp.to_mesh(pm);bp.free()
        # a tampa entra como peça à parte, encaixada na parede (sem união booleana: a malha em volta da fenda já se cruza, o braço entra
        # no corpo, e a união exata deixava arestas com 3 ou 4 faces); fica 0,1 mm abaixo da casca, que é assentada em cima dela
        bm2=bmesh.new();bm2.from_mesh(obj.data)
        # a malha do corpo ali tem triângulos grandes (a corda afunda até 0,3 mm da casca curva): parte as arestas de mais de 4 mm da
        # casca de fora
        def na_area(co):
            t=float(np.arctan2(co.x-center[0],-(co.y-center[1])))*s
            return t0_-.1<t<t1_+.1 and z0_-.03<co.z<z1_+.03 and abs(float(np.hypot(co.x-center[0],co.y-center[1]))-rout(t,co.z))<.004
        for it in range(4):
            bm2.edges.index_update()
            ed=sorted((e for e in bm2.edges if e.calc_length()>.004 and na_area(e.verts[0].co) and na_area(e.verts[1].co)),key=lambda e:e.index)
            if not ed:break
            bmesh.ops.subdivide_edges(bm2,edges=ed,cuts=1);bmesh.ops.triangulate(bm2,faces=[f for f in bm2.faces if len(f.verts)>3])
        n0=len(bm2.verts);nf0=len(bm2.faces);bm2.from_mesh(pm);bpy.data.meshes.remove(pm)
        bm2.faces.ensure_lookup_table()
        for f in bm2.faces[nf0:]:f.material_index=0;f.smooth=True
        # a casca de fora em volta vai para a superfície medida: sem degrau entre a tampa e o corpo; dentro da tampa, meio milímetro
        # abaixo dela (fica escondida); some aos poucos fora (2 cm de lado, 2 cm em cima e embaixo)
        bm2.verts.ensure_lookup_table();k2=0;mx=0.
        for v in bm2.verts[:n0]:
            t=float(np.arctan2(v.co.x-center[0],-(v.co.y-center[1])))*s;z=v.co.z
            if not(t0_-.08<t<t1_+.08 and z0_-.025<z<z1_+.025):continue
            r=float(np.hypot(v.co.x-center[0],v.co.y-center[1]));rf=rout(t,z)
            e=borda(t,z) if t0_<t<t1_ and z0_<z<z1_ else 0.
            if e>=1 and rf-.03<r<rf+.003:nr=rf-.0005          # dentro da tampa: a casca, a borda do encaixe e a raiz do braço ficam por baixo dela
            elif abs(r-rf)<=.003:
                w=min(1.,max(0.,1-max(t0_-.02-t,t-t1_-.02,0)/.06))*min(1.,max(0.,1-max(z0_-.005-z,z-z1_-.005,0)/.02))
                if w<=0:continue
                nr=r+(rf-.0005*e-r)*w
            else:continue
            v.co.x=center[0]+nr*np.sin(s*t);v.co.y=center[1]-nr*np.cos(s*t);k2+=1;mx=max(mx,abs(nr-r))
        bm2.to_mesh(obj.data);bm2.free()
        res_=RG[known]-np.array([float(Qf(np.array(t),np.array(z))@cout) for i,t in enumerate(GT) for j,z in enumerate(GZ) if known[i,j]])
        k=nf0
        fechou+=1
        print('OMBRO %s: bolso %.1f..%.1f graus, z %.3f..%.3f; tampa %dx%d (casca de fora medida em %d pontos, longe do ajuste %.4f), corpo com %d faces; %d vértices assentados (até %.4f)'%('ED'[s>0],np.degrees(ga),np.degrees(gb),za,zb,nt,nz_,int(known.sum()),res_.std(),k,k2,mx),flush=True)
    return fechou
