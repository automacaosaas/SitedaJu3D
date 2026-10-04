"""Macaquinho do Meshy (`Meshy_AI__1003230505_model-edit.glb`, recebido em 03/10/2026: o macaco inteiro, sem textura nem cor) com as
cores fixas do macaco em cinco materiais lisos (como o do Rodin: nada colorível no site, sem textura por causa da CSP do site).
Acertos de forma pedidos para este modelo: patinhas refeitas (iguais e no lugar), por dentro liso (sem o avesso da placa da barriga),
ombros sem o vão em volta da raiz dos braços e o furo de cima redondo; e a fresta embaixo da placa da barriga, que atravessava a parede.
As cores vêm do relevo do modelo visto de frente (o sulco em volta de cada parte).
Uso: blender -b -P preparar_meshy.py -- <meshy.glb> <saida.glb>
"""
import sys,os;D=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,D);sys.dont_write_bytecode=True     # sem __pycache__ na pasta
for f in ('base.py','regioes.py','cut.py','cores.py','topo.py','patas.py','ombros.py','frestas.py','dentro.py'):
    exec(open(os.path.join(D,f),encoding='utf-8').read())
a=sys.argv[sys.argv.index('--')+1:];src,dst=os.path.abspath(a[0]),os.path.abspath(a[1])
obj=importar(src)
X,Z,Y=mapa_frente(obj);R,hp,G=regioes(X,Z,Y)          # as regiões de cor, no modelo como veio (os sulcos estão inteiros)
for k,m in R.items():print('REGIAO %-13s %7d células'%(k,int(m.sum())),flush=True)
topo_redondo(obj);patas_novas(obj);tampar_ombros(obj);fechar_frestas(obj);dentro_liso(obj)
colorir(obj,R,G,X,Z)
exportar(obj,dst)
print('PRONTO',len(obj.data.polygons),'faces;',os.path.getsize(dst),'bytes',flush=True)
