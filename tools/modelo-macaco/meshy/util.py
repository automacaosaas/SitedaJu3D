# Mapas em grade (ângulo x altura ou x x altura): borrão que ignora buracos e gravação em PNG para conferir.
import numpy as np
def blur(A,s,mask=None):
    """gaussiana separável que ignora NaN (convolução normalizada); s em células"""
    m=np.isfinite(A) if mask is None else mask&np.isfinite(A);X=np.where(m,A,0.).astype(np.float64);W=m.astype(np.float64)
    r=int(3*s)+1;k=np.exp(-.5*(np.arange(-r,r+1)/s)**2);k/=k.sum()
    def conv(M):
        M=np.apply_along_axis(lambda v:np.convolve(np.pad(v,r,mode='wrap'),k,'same')[r:-r],1,M)   # theta: circular
        M=np.apply_along_axis(lambda v:np.convolve(np.pad(v,r,mode='edge'),k,'same')[r:-r],0,M)
        return M
    num=conv(X);den=conv(W);return np.where(den>1e-6,num/np.maximum(den,1e-9),np.nan)
def png(path,G,lo,hi,nan=(1,0,0)):
    import bpy
    h,w=G.shape;img=np.zeros((h,w,4),np.float32);g=np.clip((G-lo)/(hi-lo),0,1);ok=np.isfinite(G)
    for c in range(3):img[...,c]=np.where(ok,g,nan[c])
    img[...,3]=1;im=bpy.data.images.new('m',w,h,alpha=False);im.pixels=img.ravel();im.filepath_raw=path;im.file_format='PNG';im.save();bpy.data.images.remove(im)
