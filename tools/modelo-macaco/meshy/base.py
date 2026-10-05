"""Partes comuns do preparo do macaco do Meshy (importar, centro, ângulo/raio, raios a partir do eixo)."""
import bpy,bmesh,os,sys,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
def importar(src):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=src)
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    # a malha vem dentro de um vazio ("MeshEdit original coordinates"): aplica a transformação e solta
    mw=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=mw
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not obj:bpy.data.objects.remove(o,do_unlink=True)
    obj.name='macacoscopio';me=obj.data
    if me.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for p in me.polygons:p.use_smooth=True
    return obj
def exportar(obj,dst):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_materials='EXPORT')
class Polar:
    def __init__(s,c):s.c=(float(c[0]),float(c[1]))
    def theta(s,co):return float(np.arctan2(co[0]-s.c[0],-(co[1]-s.c[1])))     # 0 = frente, positivo = direita
    def radius(s,co):return float(np.hypot(co[0]-s.c[0],co[1]-s.c[1]))
    def put(s,v,r,t):v.co.x=s.c[0]+r*np.sin(t);v.co.y=s.c[1]-r*np.cos(t)
    def dir(s,t):return Vector((np.sin(t),-np.cos(t),0))
def hits(tree,o,d,maxd=1.0,n=12):
    p=Vector(o);out=[]
    for _ in range(n):
        loc,nr,fi,dist=tree.ray_cast(p,d,maxd)
        if loc is None:break
        out.append((loc.copy(),nr.copy(),fi));p=loc+d*1e-5
    return out
