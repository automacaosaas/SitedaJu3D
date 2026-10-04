# Patinhas novas: as do Meshy saíram tortas (dedos grudados, um caroço a mais ao lado da almofada direita, as duas em alturas e
# distâncias diferentes do meio). Em cada uma, a superfície é refeita: as faces da área saem, o buraco é preenchido no plano
# (ângulo x altura) com triângulos finos perto das bordas do desenho, cada ponto na superfície do corpo ajustada em volta, mais o
# relevo do desenho: uma almofada oval e quatro dedos em arco, iguais nos dois pés (um é o espelho do outro).
from mathutils.geometry import delaunay_2d_cdt
PATA=dict(theta=24.,z=-.862,almofada=(.054,.045),dedos=[(-.050,.069,.0135,.019,28.),(-.018,.088,.0135,.019,8.),(.018,.088,.0135,.019,-8.),(.050,.069,.0135,.019,-28.)],
          altura=.0035,borda=.0022,
          area={-1:(11.,37.),1:(11.,48.)})        # graus do meio do corpo: cobre o desenho novo e todo o relevo velho (o direito tinha um caroço até 45°)
def sd_pata(u,w):
    """distância com sinal ao desenho (positiva dentro), em unidades do modelo; u para fora do meio do corpo, w para cima"""
    a,b=PATA['almofada'];best=(1-np.sqrt((u/a)**2+(w/b)**2))*min(a,b)
    for du,dw,ta,tb,ang in PATA['dedos']:
        c,s=np.cos(np.radians(ang)),np.sin(np.radians(ang));x,y=u-du,w-dw;x,y=c*x+s*y,-s*x+c*y
        best=np.maximum(best,(1-np.sqrt((x/ta)**2+(y/tb)**2))*min(ta,tb))
    return best
def relevo(sd):
    A,E=PATA['altura'],PATA['borda'];s=np.clip(sd/E,0,1);s=s*s*(3-2*s)
    return A*(.82*s+.18*np.clip(sd/.012,0,1))
def patas_novas(obj,C=(-0.0005,0.042)):
    me=obj.data;bm=bmesh.new();bm.from_mesh(me);P=Polar(C);tot=0
    for side in (-1,1):
        t0=np.radians(side*PATA['theta']);z0=PATA['z'];A0,A1=np.radians(PATA['area'][side]);Z1,Z2=-.928,-.69;HT=max(abs(A0-abs(t0)),abs(A1-abs(t0)))
        inside=lambda co:A0<side*P.theta(co)<A1 and Z1<co.z<Z2 and P.radius(co)>.33
        # as faces que tocam um vértice da área; onde o contorno do buraco se encosta nele mesmo (vértice com mais de duas arestas de
        # borda), as faces em volta também saem, até o contorno ser uma volta só
        S={v for v in bm.verts if inside(v.co)};dead={f for v in S for f in v.link_faces}
        for it in range(20):
            pinch=[v for v in {v for f in dead for v in f.verts} if sum(1 for e in v.link_edges if sum(1 for g in e.link_faces if g in dead)==1)>2]
            if not pinch:break
            for v in pinch:dead|=set(v.link_faces)
        bm.faces.index_update();dead=sorted(dead,key=lambda f:f.index)
        # a superfície do corpo em volta: ajuste quadrático numa faixa de 1,5 cm fora da área
        ring=[(P.theta(v.co)-t0,v.co.z-z0,P.radius(v.co)) for v in bm.verts if P.radius(v.co)>.33 and not inside(v.co)
              and A0-np.radians(4)<side*P.theta(v.co)<A1+np.radians(4) and Z1-.015<v.co.z<Z2+.015 and v.normal.dot(P.dir(P.theta(v.co)))>.7]
        R=np.array(ring);Q=lambda t,z:np.stack([np.ones_like(t),t,z,t*t,z*z,t*z],-1)
        cf=np.linalg.lstsq(Q(R[:,0],R[:,1]),R[:,2],rcond=None)[0];res=R[:,2]-Q(R[:,0],R[:,1])@cf
        ed={e for f in dead for e in f.edges}
        bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=dead,context='FACES')
        bm.verts.index_update();bm.edges.index_update()
        hole=sorted((e for e in ed if e.is_valid and len(e.link_faces)==1),key=lambda e:e.index)     # o contorno: as arestas das faces que saíram que ficaram abertas
        adj={}
        for e in hole:
            a_,b_=e.verts;adj.setdefault(a_,[]).append(b_);adj.setdefault(b_,[]).append(a_)
        left=set(adj);loops=[]
        while left:
            cur=min(left,key=lambda v:v.index);loop=[cur];left.discard(cur);prev=None
            while True:
                nx=sorted((u for u in adj[cur] if u!=prev and u in left),key=lambda v:v.index)
                if not nx:break
                prev,cur=cur,nx[0];loop.append(cur);left.discard(cur)
            loops.append(loop)
        loop=max(loops,key=len);n=len(loop);Rm=float(cf[0])
        if len(loops)>1:print('PATA aviso: %d contornos no buraco (%s)'%(len(loops),sorted(len(l) for l in loops)),flush=True)
        to_uw=lambda t,z:(side*(t-t0)*Rm,z-z0)          # u cresce para fora do meio do corpo (o pé esquerdo é o espelho do direito)
        B2=np.array([((P.theta(v.co)-t0)*Rm,v.co.z-z0) for v in loop])
        # pontos de dentro: grade de 3 mm, mais fina (1 mm) perto das bordas do desenho e de 2 mm sobre ele
        pts=[]
        for S,cond in ((.003,lambda sd:np.abs(sd)>=.006),(.002,lambda sd:(sd>.0035)&(sd<.006)),(.001,lambda sd:np.abs(sd)<=.0035)):
            gx,gz=np.meshgrid(np.arange(B2[:,0].min()+S/2,B2[:,0].max(),S),np.arange(B2[:,1].min()+S/2,B2[:,1].max(),S));G=np.c_[gx.ravel(),gz.ravel()]
            sd=sd_pata(side*G[:,0],G[:,1]);G=G[cond(sd)];pts.append(G)
        G=np.concatenate(pts);A2,B2b=B2,np.roll(B2,-1,0)
        cross=((A2[None,:,1]>G[:,None,1])!=(B2b[None,:,1]>G[:,None,1]))&(G[:,None,0]<A2[None,:,0]+(G[:,None,1]-A2[None,:,1])*(B2b[None,:,0]-A2[None,:,0])/np.where(B2b[None,:,1]==A2[None,:,1],1e-12,B2b[None,:,1]-A2[None,:,1]))
        G=G[cross.sum(1)%2==1];AB=B2b-A2;tt=np.clip(((G[:,None,:]-A2[None])*AB[None]).sum(2)/np.maximum((AB**2).sum(1),1e-18)[None],0,1)
        G=G[np.linalg.norm(G[:,None,:]-(A2[None]+tt[...,None]*AB[None]),axis=2).min(1)>.0012]
        out_=delaunay_2d_cdt([Vector(p) for p in B2]+[Vector(p) for p in G],[(i,(i+1)%n) for i in range(n)],[list(range(n))],1,1e-9)
        vco,tris,orig=out_[0],out_[2],out_[3];vm=[]
        # a superfície do corpo dentro da área: uma membrana presa ao contorno (o raio de cada vértice da borda), partindo do ajuste;
        # assim ela emenda sem degrau com o que ficou em volta
        nv=len(vco);fixed=np.zeros(nv,bool);rb=np.zeros(nv)
        for i,co in enumerate(vco):
            if orig[i] and min(orig[i])<n:fixed[i]=True;rb[i]=P.radius(loop[min(orig[i])].co)
            else:rb[i]=float(Q(np.array(co[0]/Rm),np.array(co[1]))@cf)
        nb=[set() for _ in range(nv)]
        for tri in tris:
            for a_ in tri:
                for b_ in tri:
                    if a_!=b_:nb[a_].add(b_)
        nbl=[list(s) for s in nb]
        for it in range(400):
            new=np.array([rb[i] if fixed[i] or not nbl[i] else rb[nbl[i]].mean() for i in range(nv)])
            if np.abs(new-rb).max()<1e-7:break
            rb=new
        for i,co in enumerate(vco):
            if fixed[i]:vm.append(loop[min(orig[i])]);continue
            dt,dz=co[0]/Rm,co[1];r=rb[i]+relevo(sd_pata(side*co[0],co[1]))
            t=t0+dt;vm.append(bm.verts.new((C[0]+r*np.sin(t),C[1]-r*np.cos(t),z0+dz)))
        k=0
        for tri in tris:
            try:f=bm.faces.new([vm[i] for i in tri])
            except ValueError:continue
            f.smooth=True;f.normal_update()
            if f.normal.dot(P.dir(P.theta(f.calc_center_median())))<0:f.normal_flip()
            k+=1
        tot+=k
        print('PATA %s: %d faces velhas saem, superfície em volta ajustada (desvio %.4f), %d triângulos novos (%d pontos)'%('ED'[side>0],len(dead),res.std(),k,len(G)),flush=True)
    bm.normal_update();bm.to_mesh(me);bm.free();me.update()
