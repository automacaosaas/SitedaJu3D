# Cores: cinco materiais lisos, os mesmos do macaco do Rodin (nada colorível no site). As regiões vêm do relevo do modelo original visto
# de frente (regioes.py); o contorno de cada uma é alisado e cortado na própria malha, só nas faces que se veem de frente.
NAMES=['fur','face','features','banana','highlight'];FUR,FACE,FEAT,BAN,HIGH=range(5)
PALETTE={'fur':((99,41,27),.431),'face':((212,168,144),.361),'features':((37,35,35),.25),'banana':((244,199,3),.416),'highlight':((244,243,244),.25)}
def lin(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def crescer(M,G,n):
    """M mais n células de sulco em volta (o contorno vai para o meio do sulco)"""
    for it in range(n):M=M|((np.roll(M,1,0)|np.roll(M,-1,0)|np.roll(M,1,1)|np.roll(M,-1,1))&G)
    return M
def fechar(M,n):
    """fechamento: preenche sulcos estreitos (até 2n células) entre partes da mesma área, sem mexer na borda de fora"""
    D=M.copy()
    for it in range(n):D=D|np.roll(D,1,0)|np.roll(D,-1,0)|np.roll(D,1,1)|np.roll(D,-1,1)
    for it in range(n):D=D&np.roll(D,1,0)&np.roll(D,-1,0)&np.roll(D,1,1)&np.roll(D,-1,1)
    return D|M
def colorir(obj,R,G,X,Z):
    from util import blur
    me=obj.data;me.materials.clear()
    for n in NAMES:
        srgb,rough=PALETTE[n];mat=bpy.data.materials.new(n);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*lin(np.array(srgb)/255),1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=0
        me.materials.append(mat)
    Xf,Zf,Yf=mapa_frente(obj)            # a forma corrigida: diz que face se vê de frente
    preto=crescer(R['olhos']|R['sobrancelhas']|R['nariz'],G,1);amarelo=crescer(R['banana'],G,1);branco=R['brilho']
    # os sulcos são divididos entre os dois lados: as partes bege (com o que fica dentro delas) e o resto (pelo, braços, mãos) crescem
    # sulco adentro uma célula por vez; os sulcos de dentro do rosto e da barriga só encostam em bege e ficam inteiros bege
    B=R['placa']|R['orelhas']|R['barriga']|R['olhos']|R['sobrancelhas']|R['nariz']|R['brilho']|R['banana'];ok=np.isfinite(Yf)
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
    campos=[(FACE,bege),(FEAT,preto|branco),(HIGH,branco),(BAN,amarelo)]
    bm=bmesh.new();bm.from_mesh(me);vl=bm.faces.layers.int.new('vista')
    def amostra(A,x,z):
        fi=(z-Z[0])/(Z[1]-Z[0]);fj=(x-X[0])/(X[1]-X[0])
        if not(0<=fi<A.shape[0]-1 and 0<=fj<A.shape[1]-1):return np.nan
        i,j=int(fi),int(fj);a,b=fi-i,fj-j;return A[i,j]*(1-a)*(1-b)+A[i+1,j]*a*(1-b)+A[i,j+1]*(1-a)*b+A[i+1,j+1]*a*b
    for f in bm.faces:
        f.material_index=FUR;c=f.calc_center_median();y=amostra(Yf,c.x,c.z)
        rad=f.normal.x*(c.x+.0005)+f.normal.y*(c.y-.042)        # para fora do tubo (não a parede de dentro)
        f[vl]=1 if f.normal.y<.5 and rad>0 and np.isfinite(y) and -.001<c.y-y<.03 else 0      # vista de frente, ou parede de sulco (até 3 cm abaixo)
    # antes do corte: as faces da frente (mesmo as escondidas: paredes de sulco por baixo da beirada) pegam a cor do lugar delas
    pre=[f for f in bm.faces if f.normal.y<.9 and np.hypot(f.calc_center_median().x+.0005,f.calc_center_median().y-.042)>.325
         and np.isfinite(y_:=amostra(Yf,f.calc_center_median().x,f.calc_center_median().z)) and -.001<f.calc_center_median().y-y_<.05]
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
        k=cut(bm,None,fs,mat,domain=lambda f:f[vl]==1,fnv=lambda v:.5-(lambda s:0. if not np.isfinite(s) else s)(amostra(F,v.co.x,v.co.z)))
        bm.faces.ensure_lookup_table()
        print('COR %-9s %6d faces'%(NAMES[mat],k),flush=True)
    bm.faces.layers.int.remove(vl);bm.to_mesh(me);bm.free();me.update()
    cnt=np.bincount([p.material_index for p in me.polygons],minlength=5)
    print('CORES',' '.join('%s %d'%(n,c) for n,c in zip(NAMES,cnt)),'faces',len(me.polygons),flush=True)
