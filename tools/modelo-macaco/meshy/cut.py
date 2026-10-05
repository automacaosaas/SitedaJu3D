# Corte de contorno na malha (o mesmo de ../preparar_cores.py, do macaco do Rodin).
def cut(bm,fn,faces,inside_mat,domain=None,fnv=None):
    """Parte as faces ao longo de fn==0 (fn<0 é dentro) e pinta de inside_mat as que ficam inteiras dentro."""
    val={}
    for f in faces:
        for v in f.verts:
            if v not in val:x=fnv(v) if fnv else fn(v.co);val[v]=x if abs(x)>=1e-12 else 1e-12
    # ordem fixa (índices), para o arquivo sair igual a cada execução
    bm.edges.index_update();zero=[]
    for e in sorted({e for f in faces for e in f.edges},key=lambda e:e.index):
        a,b=e.verts
        if (val[a]<0)!=(val[b]<0):
            t=val[a]/(val[a]-val[b]);p=a.co.lerp(b.co,t)
            _,nv=bmesh.utils.edge_split(e,a,t);nv.co=p;val[nv]=0.0;zero.append(nv)
    zs_=set(zero)
    for f in list(dict.fromkeys(f for v in zero for f in v.link_faces)):
        if not f.is_valid:continue
        zs=[v for v in f.verts if v in zs_]
        if len(zs)!=2:continue
        a,b=zs
        if any(b in e.verts for e in a.link_edges if f in e.link_faces):continue
        try:bmesh.utils.face_split(f,a,b)
        except Exception:pass
    painted=0
    for f in bm.faces:
        vals=[val.get(v) for v in f.verts]
        if None in vals:continue
        if domain is not None and not domain(f):continue     # só faces da própria área (não as vizinhas que compartilham vértices)
        if all(x<=0 for x in vals) and min(vals)<0:f.material_index=inside_mat;painted+=1
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    return painted
