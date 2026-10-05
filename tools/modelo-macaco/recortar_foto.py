"""Recorta a foto do Macacoscópio (fundo cinza-claro neutro) e a encaixa no quadro das fotos da vitrine.
Uso: blender -b -P recortar_foto.py -- <foto> <saida.png> [h=.8716] [bottom=.0542] [S=1254]
- se a foto já tem fundo transparente, usa o alfa dela; senão, fundo: região neutra (pouca saturação) ligada à borda da imagem: o fundo claro e a sombra no chão, também neutra, saem juntos;
  o que é claro mas fica cercado pelo macaco (patinhas, brilho dos olhos) não é alcançado e fica;
- borda: alfa pela mistura entre a cor do macaco (vizinho de dentro) e a do fundo (superfície ajustada), e a cor sem a mistura;
- quadro: quadrado S, a peça com altura h e margem de baixo `bottom` (os números `art` do products.js), centrada no eixo do tubo.
"""
import bpy,os,sys,numpy as np
a=sys.argv[sys.argv.index('--')+1:];src,dst=os.path.abspath(a[0]),os.path.abspath(a[1])
H=float(a[2]) if len(a)>2 else .8716;BOT=float(a[3]) if len(a)>3 else .0542;S=int(a[4]) if len(a)>4 else 1254
im=bpy.data.images.load(src);w,h=im.size;x4=np.array(im.pixels[:],np.float32).reshape(h,w,4)[::-1].copy();bpy.data.images.remove(im);x=x4[...,:3].copy()
HAS_ALPHA=x4[...,3].min()<.99      # a foto já vem recortada (fundo transparente): usa o alfa dela
mx=x.max(2);mn=x.min(2);sat=(mx-mn)/np.maximum(mx,1e-6)
def shift(m,dy,dx):
    o=np.zeros_like(m);ys=slice(max(dy,0),h+min(dy,0));yd=slice(max(-dy,0),h+min(-dy,0));xs=slice(max(dx,0),w+min(dx,0));xd=slice(max(-dx,0),w+min(-dx,0))
    o[ys,xs]=m[yd,xd];return o
def dil(m,k=1):
    for _ in range(k):m=m|shift(m,1,0)|shift(m,-1,0)|shift(m,0,1)|shift(m,0,-1)
    return m
cand=np.zeros((h,w),bool) if HAS_ALPHA else (sat<.14)&(mx>.25)        # neutro: fundo claro e a sombra (de contato também), mais escura
bg=np.zeros((h,w),bool);bg[0,:]=cand[0,:];bg[-1,:]=cand[-1,:];bg[:,0]=cand[:,0];bg[:,-1]=cand[:,-1]
while True:
    n=dil(bg)&cand
    if (n==bg).all():break
    bg=n
fg=~bg
# fundo como superfície suave (quadrática por canal) ajustada nos pixels de fundo
yy,xx=np.mgrid[0:h,0:w];X=np.stack([np.ones(h*w),xx.ravel()/w,yy.ravel()/h,(xx.ravel()/w)**2,(yy.ravel()/h)**2,xx.ravel()*yy.ravel()/(w*h)],1)
sel=bg.ravel()&(np.arange(h*w)%7==0);B=np.zeros_like(x)
for c in range(3):coef=np.linalg.lstsq(X[sel],x[...,c].ravel()[sel],rcond=None)[0];B[...,c]=(X@coef).reshape(h,w)
# faixa da borda: 3 px para cada lado; cor do macaco propagada de dentro para fora
core=fg.copy()
for _ in range(3):core=core&shift(core,1,0)&shift(core,-1,0)&shift(core,0,1)&shift(core,0,-1)
band=dil(fg,3)&~core
F=np.where(core[...,None],x,0);known=core.copy()
for _ in range(8):
    acc=np.zeros_like(x);cnt=np.zeros((h,w),np.float32)
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        k=shift(known,dy,dx);acc+=np.where(k[...,None],shift(F,dy,dx),0);cnt+=k
    new=(~known)&(cnt>0);F[new]=acc[new]/cnt[new][:,None];known|=new
d=F-B;al=np.clip(((x-B)*d).sum(2)/np.maximum((d*d).sum(2),1e-6),0,1)
alpha=np.where(core,1.,np.where(band,al,0.)).astype(np.float32)
col=np.where(alpha[...,None]>.02,B+(x-B)/np.maximum(alpha[...,None],.02),F);col=np.clip(np.where(core[...,None],x,col),0,1)
if HAS_ALPHA:alpha,col=x4[...,3].copy(),x
ys,xs=np.where(alpha>.5);top,bot=ys.min(),ys.max()
# eixo do tubo: centro das linhas entre 55% e 85% da altura (abaixo das mãos, acima dos pés)
mid=[(np.where(alpha[r]>.5)[0].min()+np.where(alpha[r]>.5)[0].max())/2 for r in range(int(top+.55*(bot-top)),int(top+.85*(bot-top)))]
axis=float(np.median(mid))
print('RECORTE conteudo y',top,bot,'eixo x %.1f'%axis,'fundo %.1f%%'%(100*bg.mean()),flush=True)
# quadro: escala para a altura H*S, base em (1-BOT)*S, eixo no centro
s=H*S/(bot-top+1);rgba=np.concatenate([col*alpha[...,None],alpha[...,None]],2)   # pré-multiplicado para reamostrar
W2,H2=max(1,round(w*s)),max(1,round(h*s))
tmp=bpy.data.images.new('t',w,h,alpha=True);tmp.pixels=rgba[::-1].ravel();tmp.scale(W2,H2);r=np.array(tmp.pixels[:],np.float32).reshape(H2,W2,4)[::-1];bpy.data.images.remove(tmp)
out=np.zeros((S,S,4),np.float32);oy=round((1-BOT)*S-(bot+1)*s);ox=round(S/2-(axis+.5)*s)
y0,x0=max(oy,0),max(ox,0);y1,x1=min(oy+H2,S),min(ox+W2,S);out[y0:y1,x0:x1]=r[y0-oy:y1-oy,x0-ox:x1-ox]
a_=out[...,3:4];out[...,:3]=np.where(a_>1e-4,out[...,:3]/np.maximum(a_,1e-4),0);out=np.clip(out,0,1)
img=bpy.data.images.new('o',S,S,alpha=True);img.alpha_mode='STRAIGHT';img.pixels=out[::-1].ravel();img.filepath_raw=dst;img.file_format='PNG';img.save()
ys,xs=np.where(out[...,3]>.5);print('QUADRO',S,'peca y',ys.min(),ys.max(),'x',xs.min(),xs.max(),'h %.4f bottom %.4f'%((ys.max()-ys.min()+1)/S,(S-1-ys.max())/S),flush=True)
