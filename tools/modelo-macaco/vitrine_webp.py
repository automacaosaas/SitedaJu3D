"""Foto da vitrine e cards do Macacoscópio em WebP, sem ffmpeg (com o Blender).
Uso: blender -b -P vitrine_webp.py -- <render-monkey.png> <card atual em PNG (para as margens)> <pasta de saída>
Grava product-macacoscopio-cutout.webp (como renderizado), card-macacoscopio.webp (768: o macaco com a mesma altura e a mesma
margem de baixo do card anterior, centrado) e card-preview-macacoscopio.webp (384).
"""
import bpy,os,sys,numpy as np
a=sys.argv[sys.argv.index('--')+1:];src,old_card,outdir=[os.path.abspath(x) for x in a]
sc=bpy.context.scene;sc.view_settings.view_transform='Standard';sc.view_settings.look='None';sc.view_settings.exposure=0;sc.view_settings.gamma=1
st=sc.render.image_settings;st.file_format='WEBP';st.color_mode='RGBA';st.quality=90
def load(p):
    im=bpy.data.images.load(p);w,h=im.size;x=np.array(im.pixels[:],np.float32).reshape(h,w,4);bpy.data.images.remove(im);return x  # linhas de baixo para cima
def save(x,path):
    h,w=x.shape[:2];im=bpy.data.images.new('o',w,h,alpha=True);im.alpha_mode='STRAIGHT';im.pixels=x.ravel();im.save_render(path);bpy.data.images.remove(im);print('SAVED',os.path.basename(path),w,h,os.path.getsize(path)//1024,'KB')
def bbox(x,t=.03):
    ys,xs=np.where(x[...,3]>t);return xs.min(),xs.max(),ys.min(),ys.max()
def resize(x,W,H):
    im=bpy.data.images.new('r',x.shape[1],x.shape[0],alpha=True);im.alpha_mode='STRAIGHT'
    pm=x.copy();pm[...,:3]*=pm[...,3:4];im.pixels=pm.ravel();im.scale(W,H);y=np.array(im.pixels[:],np.float32).reshape(H,W,4);bpy.data.images.remove(im)
    y[...,:3]=np.where(y[...,3:4]>1e-4,y[...,:3]/np.maximum(y[...,3:4],1e-4),0);return np.clip(y,0,1)
x=load(src);save(x,os.path.join(outdir,'product-macacoscopio-cutout.webp'))
# card: mesma altura de conteúdo e mesma margem de baixo do card atual, centrado
c=load(old_card);cx0,cx1,cy0,cy1=bbox(c);S=c.shape[0];print('CARD ATUAL conteudo x',cx0,cx1,'y(baixo->cima)',cy0,cy1,'de',S)
x0,x1,y0,y1=bbox(x);crop=x[y0:y1+1,x0:x1+1];ch=cy1-cy0+1;scale=ch/crop.shape[0];cw=max(1,round(crop.shape[1]*scale))
r=resize(crop,cw,ch);card=np.zeros((S,S,4),np.float32);left=(S-cw)//2;card[cy0:cy0+ch,left:left+cw]=r
save(card,os.path.join(outdir,'card-macacoscopio.webp'));save(resize(card,S//2,S//2),os.path.join(outdir,'card-preview-macacoscopio.webp'))
print('CARD NOVO conteudo x',left,left+cw-1,'y',cy0,cy0+ch-1)
