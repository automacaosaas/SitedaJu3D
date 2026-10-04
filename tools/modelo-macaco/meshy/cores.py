# Cores: cinco materiais lisos, os mesmos do macaco do Rodin (nada colorível no site). As regiões vêm do relevo do modelo original visto
# de frente (regioes.py); o contorno de cada uma é alisado e cortado na própria malha, só nas faces que se veem de frente.
NAMES=['fur','face','features','banana','highlight'];FUR,FACE,FEAT,BAN,HIGH=range(5)
PALETTE={'fur':((99,41,27),.431),'face':((212,168,144),.361),'features':((37,35,35),.25),'banana':((244,199,3),.416),'highlight':((244,243,244),.25)}
def lin(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def crescer(M,G,n):
    """M mais n células de sulco em volta (o contorno vai para o meio do sulco)"""
    for it in range(n):M=M|((np.roll(M,1,0)|np.roll(M,-1,0)|np.roll(M,1,1)|np.roll(M,-1,1))&G)
    return M
def mascaras(R,G,ok):
    preto=crescer(R['olhos']|R['sobrancelhas']|R['nariz'],G,1);amarelo=crescer(R['banana'],G,1);branco=R['brilho']
    # os sulcos são divididos entre os dois lados: as partes bege (com o que fica dentro delas) e o resto (pelo, braços, mãos) crescem
    # sulco adentro uma célula por vez; os sulcos de dentro do rosto e da barriga só encostam em bege e ficam inteiros bege
    B=R['placa']|R['orelhas']|R['barriga']|R['olhos']|R['sobrancelhas']|R['nariz']|R['brilho']|R['banana']
    # o pelo: as áreas livres grandes fora do bege (cabeça, corpo, braços, mãos); as pequenas (o fundo chato de um sulco largo) são sulco
    A0=~G&~B&ok;A=np.zeros(A0.shape,bool);vis=np.zeros(A0.shape,bool)
    for c in zip(*np.where(A0)):
        if vis[c]:continue
        comp=bfs(A0,c);vis|=comp
        if comp.sum()>1500:A|=comp
    livreG=(G|(A0&~A))&ok
    dil=lambda M:M|np.roll(M,1,0)|np.roll(M,-1,0)|np.roll(M,1,1)|np.roll(M,-1,1)
    for it in range(60):
        nb=dil(B)&livreG&~A&~B;na=dil(A)&livreG&~A&~B&~nb
        if not nb.any() and not na.any():break
        B=B|nb;A=A|na
    bege=B|preto|amarelo|branco
    return bege,preto,amarelo,branco
def elipse(e,x,z):
    """< 0 dentro da elipse e=(cx,cz,a,b,ângulo), em unidades do modelo (aprox.)"""
    cx,cz,a_,b_,ang=e;dx,dz=x-cx,z-cz;u=dx*np.cos(ang)+dz*np.sin(ang);v=-dx*np.sin(ang)+dz*np.cos(ang)
    return (np.sqrt((u/a_)**2+(v/b_)**2)-1)*min(a_,b_)
PUNHOS=(-.28,.02)      # alturas dos punhos sobre a placa (z)
def casco(M):
    """o fecho convexo da área M (a placa da barriga é uma pílula, convexa: os punhos e a banana não a cortam)"""
    rows=[i for i in range(M.shape[0]) if M[i].any()];P=[]
    for i in rows:
        jj=np.where(M[i])[0];P+=[(jj[0],i),(jj[-1],i)]
    P=sorted(set(P))
    def cr(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo,hi=[],[]
    for p in P:
        while len(lo)>=2 and cr(lo[-2],lo[-1],p)<=0:lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(hi)>=2 and cr(hi[-2],hi[-1],p)<=0:hi.pop()
        hi.append(p)
    H=lo[:-1]+hi[:-1];out=np.zeros(M.shape,bool)
    for i in range(min(r for _,r in H),max(r for _,r in H)+1):
        xs=[]
        for k in range(len(H)):
            (x0,y0),(x1,y1)=H[k],H[(k+1)%len(H)]
            if (y0-i)*(y1-i)<=0 and y0!=y1:xs.append(x0+(i-y0)*(x1-x0)/(y1-y0))
            elif y0==y1==i:xs+=[x0,x1]
        if xs:out[i,int(np.ceil(min(xs))):int(np.floor(max(xs)))+1]=True
    return out
def maos_na_barriga(bm,R,G,X,Z,Yf,amostra,silb,ALT=.004,BAIXO=-.0005):
    """As mãos encostam na placa da barriga, do lado de fora dela. Perto dos punhos o "sulco" (que é dividido entre o bege e o marrom)
    pega também a placa ao lado do punho, que fica abaixo da média em volta (o punho a levanta): ficavam pontas marrons na placa. Ali a
    cor vem da altura sobre a superfície da placa (estendida um pouco para fora dela): mais de 4 mm acima é mão (marrom); na altura da
    placa é placa (bege); abaixo dela (o corpo, a fenda entre a placa e o corpo) é marrom."""
    from util import blur
    ok=np.isfinite(Yf);dil=lambda M,n:[M:=M|np.roll(M,1,0)|np.roll(M,-1,0)|np.roll(M,1,1)|np.roll(M,-1,1) for _ in range(n)][-1]
    B=R['placa']|R['orelhas']|R['barriga']|R['olhos']|R['sobrancelhas']|R['nariz']|R['brilho']|R['banana']
    hpg=-(Yf-blur(Yf,40));punho=~G&~B&ok&(hpg>.006)            # o que sobe muito na altura da barriga: punhos e braços
    zona=dil(R['barriga'].copy(),30)&dil(punho.copy(),30)&~dil(R['banana'].copy(),12)
    zona&=((Z>PUNHOS[0])&(Z<PUNHOS[1]))[:,None]          # só na altura dos punhos (mais abaixo, a beira da placa fica como estava)
    # a superfície da placa, estendida para fora dela, como distância ao eixo do tubo (a placa é um cilindro: a profundidade vista de
    # frente muda depressa perto dos lados, o raio não)
    K=R['barriga']&~G&ok;Rf=np.hypot(X[None,:]+.0005,Yf-.042);RB=blur(np.where(K,Rf,np.nan),10)
    hz=bm.faces.layers.int.new('maos');Zf=zona.astype(float);fs=[];bm.faces.ensure_lookup_table()      # a casca de fora toda, até o fundo da fenda
    def altura(co):
        r=amostra(RB,co.x,co.z);return np.nan if not np.isfinite(r) else np.hypot(co.x+.0005,co.y-.042)-r
    for f in bm.faces:
        if f.material_index==BAN:continue
        c=f.calc_center_median();s_=amostra(Zf,c.x,c.z)
        if not(np.isfinite(s_) and s_>.5 and np.isfinite(altura(c))) or c.y>-.05 or np.hypot(c.x+.0005,c.y-.042)<=.325:continue
        f[hz]=1;fs.append(f);f.material_index=FUR          # os cortes abaixo pintam a faixa da altura da placa de bege
    alt=lambda v:(lambda h:BAIXO-.001 if not np.isfinite(h) else h)(altura(v.co))
    # a faixa da altura da placa só vale ligada à placa pela superfície: a encosta do braço que desce para a fenda também passa por essa
    # altura, do outro lado da fenda
    def acima(f):
        h=altura(f.calc_center_median());return np.isfinite(h) and h>BAIXO
    # (só dentro do contorno da placa, mais 3 mm: o corpo do outro lado da fenda, na mesma altura, ficaria bege pela base do punho)
    Sm=silb.copy()
    for it in range(3):Sm=Sm|np.roll(Sm,1,0)|np.roll(Sm,-1,0)|np.roll(Sm,1,1)|np.roll(Sm,-1,1)
    Sm=Sm.astype(float)
    def na_sil(f):                       # algum vértice dentro (as faces ali são triângulos compridos da placa até o punho)
        return any((lambda s_:np.isfinite(s_) and s_>.5)(amostra(Sm,v.co.x,v.co.z)) for v in f.verts)
    faixa={f for f in fs if acima(f) and na_sil(f)};Pm=R['barriga'].astype(float)
    def na_placa(f):
        c=f.calc_center_median();s_=amostra(Pm,c.x,c.z);return np.isfinite(s_) and s_>.5
    sem=sorted((f for f in faixa if na_placa(f)),key=lambda f:f.index)
    lig=set(sem);fila=list(sem)
    while fila:
        f=fila.pop()
        for e in f.edges:
            for g in e.link_faces:
                if g in faixa and g not in lig:lig.add(g);fila.append(g)
    for f in fs:
        if f in lig:f[hz]=2
    k1=cut(bm,None,fs,FACE,domain=lambda f:f[hz]==2,fnv=lambda v:BAIXO-alt(v));bm.faces.ensure_lookup_table()
    fs=[f for f in bm.faces if f[hz]]
    k2=cut(bm,None,fs,FUR,domain=lambda f:f[hz]>0,fnv=lambda v:ALT-alt(v));bm.faces.ensure_lookup_table()
    # a banana também é alta (até 5 cm) e de lados em pé: a divisa vista de frente caía na parede dela, em pontas. Na volta dela, o que
    # sobe mais de 2 mm acima da placa é banana; o resto que está na altura da placa ou acima, placa (abaixo fica como estava)
    zb=dil(R['banana'].copy(),12)&ok;Bf=zb.astype(float);fb=[]
    for f in bm.faces:
        if f[hz]:continue
        c=f.calc_center_median();s_=amostra(Bf,c.x,c.z)
        if not(np.isfinite(s_) and s_>.5 and np.isfinite(altura(c))) or c.y>-.05 or np.hypot(c.x+.0005,c.y-.042)<=.325:continue
        f[hz]=3;fb.append(f)
    k3=cut(bm,None,fb,FACE,domain=lambda f:f[hz]==3,fnv=lambda v:BAIXO-alt(v));bm.faces.ensure_lookup_table()
    fb=[f for f in bm.faces if f[hz]==3]
    k4=cut(bm,None,fb,BAN,domain=lambda f:f[hz]==3,fnv=lambda v:.002-alt(v));bm.faces.ensure_lookup_table()
    print('BANANA pela altura: %d faces de placa, %d de banana (mais de 2 mm acima)'%(k3-k4,k4),flush=True)
    bm.faces.layers.int.remove(hz)
    print('MAOS na barriga: zona de %d células, %d faces; %d na altura da placa, %d de mão (mais de %.0f mm acima)'%(zona.sum(),len(fs),k1,k2,ALT*1000),flush=True)
    return zb,altura,ALT
def bordas_das_placas(bm,sil,X,Z,amostra,banana,alto,FAIXA=6,INCL=.25,ZFUNDO=-.57):
    """As bordas da placa do rosto e da barriga são fendas e degraus de paredes em pé; a divisa vista de frente caía na parede, ora de
    um lado, ora do outro (manchas bege na fenda, borda bege serrilhada embaixo do rosto). Numa faixa de 7 mm em volta do contorno de
    cada placa, a face inclinada vai pelo lado para onde olha: a parede da placa (olha para fora dela) é bege, a do corpo (olha para a
    placa) é marrom; a cor troca no fundo da fenda (onde a inclinação troca de lado), cortada na malha. As faces deitadas ficam como
    estavam, e também o que é mão (mais alto que a placa) e a volta da banana."""
    from util import blur
    P_=Polar((-0.0005,0.042));tot=0
    for nome in ('placa','barriga'):
        M=sil[nome].copy();ero=M.copy();dil_=M.copy()
        for it in range(FAIXA):
            ero=ero&np.roll(ero,1,0)&np.roll(ero,-1,0)&np.roll(ero,1,1)&np.roll(ero,-1,1)
            dil_=dil_|np.roll(dil_,1,0)|np.roll(dil_,-1,0)|np.roll(dil_,1,1)|np.roll(dil_,-1,1)
        faixa=dil_&~ero&~banana
        if nome=='barriga':faixa&=(Z>ZFUNDO)[:,None]          # o fundo da placa da barriga é refeito à parte
        Bm=blur(M.astype(float),4);gz,gx=np.gradient(Bm);gn=np.hypot(gx,gz)+1e-12;OX,OZ=-gx/gn,-gz/gn      # para fora da placa
        Fm=faixa.astype(float);bm.normal_update();lay=bm.faces.layers.int.get('borda') or bm.faces.layers.int.new('borda')
        def para_fora(co,no):
            ox,oz=amostra(OX,co.x,co.z),amostra(OZ,co.x,co.z)
            if not(np.isfinite(ox) and np.isfinite(oz)):return 0.
            t=P_.theta(co);return no.x*np.cos(t)*ox+no.y*np.sin(t)*ox+no.z*oz     # componente da normal para fora da placa, na casca
        val={};fs=[]
        for f in bm.faces:
            c=f.calc_center_median();s_=amostra(Fm,c.x,c.z)
            if not(np.isfinite(s_) and s_>.5) or c.y>-.1 or P_.radius(c)<=.325 or f.material_index in (FEAT,HIGH,BAN):continue      # só a frente (as costas caem no mesmo contorno visto de frente)
            if nome=='barriga' and any(alto(v.co) for v in f.verts):continue       # encosta no punho: fica com a regra da altura
            for v in f.verts:
                if v not in val:val[v]=para_fora(v.co,v.normal)
            if abs(para_fora(c,f.normal))>=INCL or max(abs(val[v]) for v in f.verts)>=INCL:f[lay]=1;f.material_index=FUR;fs.append(f)
        # a inclinação de cada vértice, suavizada entre vizinhos (as normais da malha do Meshy são ruidosas: a divisa sairia serrilhada)
        vs=sorted(val,key=lambda v:v.index);ix={v:i for i,v in enumerate(vs)};a_=np.array([val[v] for v in vs])
        nb_=[[ix[e.other_vert(v)] for e in v.link_edges if e.other_vert(v) in ix] for v in vs]
        for it in range(4):a_=.5*a_+.5*np.array([a_[n].mean() if n else a_[i] for i,n in enumerate(nb_)])
        val={v:float(a_[i]) for i,v in enumerate(vs)}
        # nas faces inclinadas a cor troca onde a inclinação troca de lado (no fundo da fenda, no vinco do pé da parede), cortada na malha
        k=cut(bm,None,fs,FACE,domain=lambda f:f[lay]==1,fnv=lambda v:-val[v] if v in val else -para_fora(v.co,v.normal))
        bm.faces.ensure_lookup_table()
        for f in bm.faces:f[lay]=0
        bm.faces.layers.int.remove(lay);tot+=k;print('BORDA da %s: faixa de %d células, %d faces inclinadas, %d bege (a parede da placa)'%(nome,faixa.sum(),len(fs),k),flush=True)
def colorir(obj,R,G,X,Z):
    from util import blur
    me=obj.data;me.materials.clear()
    for n in NAMES:
        srgb,rough=PALETTE[n];mat=bpy.data.materials.new(n);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*lin(np.array(srgb)/255),1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=0
        me.materials.append(mat)
    Xf,Zf,Yf=mapa_frente(obj)            # a forma corrigida: diz que face se vê de frente
    bege,preto,amarelo,branco=mascaras(R,G,np.isfinite(Yf))
    campos=[(FACE,bege),(FEAT,preto|branco),(HIGH,branco),(BAN,amarelo)]
    bm=bmesh.new();bm.from_mesh(me);vl=bm.faces.layers.int.new('vista')
    def amostra(A,x,z):
        fi=(z-Z[0])/(Z[1]-Z[0]);fj=(x-X[0])/(X[1]-X[0])
        if not(0<=fi<A.shape[0]-1 and 0<=fj<A.shape[1]-1):return np.nan
        i,j=int(fi),int(fj);a,b=fi-i,fj-j;return A[i,j]*(1-a)*(1-b)+A[i+1,j]*a*(1-b)+A[i,j+1]*(1-a)*b+A[i+1,j+1]*a*b
    # quanto cada face fica atrás da primeira superfície vista de frente (um raio exato no centro dela: o mapa em grade erra nas faces
    # quase horizontais, como o alto do nariz, onde a profundidade pula de uma célula para a outra)
    tree=BVHTree.FromBMesh(bm);atras={}
    for f in bm.faces:
        f.material_index=FUR;c=f.calc_center_median()
        if np.hypot(c.x+.0005,c.y-.042)<=.325:continue        # o oco por dentro fica de fora (as orelhas, dos lados, entram)
        loc=tree.ray_cast(Vector((c.x,-2,c.z)),Vector((0,1,0)),4)[0]
        if loc is not None:atras[f]=c.y-loc.y
    for f in bm.faces:
        c=f.calc_center_median();rad=f.normal.x*(c.x+.0005)+f.normal.y*(c.y-.042)        # para fora do tubo (não a parede de dentro)
        f[vl]=1 if f in atras and f.normal.y<.5 and rad>0 and atras[f]<.03 else 0      # vista de frente, ou parede de sulco (até 3 cm abaixo)
    # antes do corte: as faces da frente (mesmo as escondidas: paredes de sulco por baixo da beirada) pegam a cor do lugar delas
    pre=[f for f in bm.faces if f in atras and f.normal.y<.9 and atras[f]<.05]
    for mat,M in campos:
        Mf=M.astype(float)
        for f in pre:
            c=f.calc_center_median();s_=amostra(Mf,c.x,c.z)
            if np.isfinite(s_) and s_>.5:f.material_index=mat
    for mat,M in campos:
        F=blur(M.astype(float),1.5);ii,jj=np.where(M)
        if not len(ii):continue
        x0,x1,z0,z1=X[jj].min()-.01,X[jj].max()+.01,Z[ii].min()-.01,Z[ii].max()+.01
        fs=[f for f in bm.faces if f[vl] and x0<f.calc_center_median().x<x1 and z0<f.calc_center_median().z<z1]
        if mat==HIGH and BRILHOS:fnv=lambda v:min(elipse(e,v.co.x,v.co.z) for e in BRILHOS)       # o oval exato
        else:fnv=lambda v:.5-(lambda s:0. if not np.isfinite(s) else s)(amostra(F,v.co.x,v.co.z))
        k=cut(bm,None,fs,mat,domain=lambda f:f[vl]==1,fnv=fnv)
        bm.faces.ensure_lookup_table()
        print('COR %-9s %6d faces'%(NAMES[mat],k),flush=True)
    # o contorno de cada placa: o bege final (com o que ele cerca) ligado ao meio da testa e ao meio da barriga
    sil={}
    for nome,(x_,z_) in (('placa',(0,.68)),('barriga',(0,-.15))):
        c_=(int(round((z_-Z[0])/(Z[1]-Z[0]))),int(round((x_-X[0])/(X[1]-X[0]))));sil[nome]=tapar_furos(bfs(bege,c_))
    # a da barriga: perto dos punhos o bege é incerto (era lá o problema); a placa é uma pílula, então o contorno é o fecho convexo dela
    # (segue reto por baixo dos punhos)
    sil['barriga']=casco(R['barriga']|R['banana'])
    zb,altura,ALT=maos_na_barriga(bm,R,G,X,Z,Yf,amostra,sil['barriga'])
    bordas_das_placas(bm,sil,X,Z,amostra,zb,lambda c:(lambda h:np.isfinite(h) and h>ALT)(altura(c)))
    bm.faces.layers.int.remove(vl);bm.to_mesh(me);bm.free();me.update()
    cnt=np.bincount([p.material_index for p in me.polygons],minlength=5)
    print('CORES',' '.join('%s %d'%(n,c) for n,c in zip(NAMES,cnt)),'faces',len(me.polygons),flush=True)
