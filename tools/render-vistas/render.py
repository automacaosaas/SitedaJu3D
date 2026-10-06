"""Fotos da galeria renderizadas do modelo 3D (pedido de 05/10/2026: as fotos recortadas das fontes comprimidas ficavam ruins). Cycles,
luz de estúdio (o studio.exr do próprio Blender e uma luz principal suave), fundo transparente (a galeria fica sobre o fundo da
página; a sombra leve no chão entra depois, igual à das outras fotos), as cores da vitrine, tratamento de cor Standard (as cores
ficam as da paleta; o AgX desbotava o amarelo e o verde-menta). Cada vista no quadro 4:5 do padrão (dist/gallery.js): nas inteiras,
a peça com 80% da altura e o pé a 8% da borda de baixo, girada na frente da câmera (a luz fica igual em todas); o detalhe de perto é
outra câmera, perto de verdade (não uma ampliação).
Uso: blender -b -P render.py -- <config.json>
  config: {"modelo": "...glb", "saida": "pasta", "cores": {"body": "#...", ...}, "vistas": [{"id", "giro", "detalhe": [centro, altura]}],
           "largura": 1200, "altura": 1500, "amostras": 128}
"""
import bpy,sys,os,json,math,numpy as np
from mathutils import Vector,Matrix
C=json.load(open(sys.argv[sys.argv.index('--')+1],encoding='utf-8'))
W,H=C.get('largura',1200),C.get('altura',1500);TALL,BASE=.80,.08

def limpar():
    bpy.ops.wm.read_factory_settings(use_empty=True)
def importar(src):
    bpy.ops.import_scene.gltf(filepath=src)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH':mw=o.matrix_world.copy();o.parent=None;o.matrix_world=mw
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    obj=bpy.context.view_layer.objects.active;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for p in obj.data.polygons:p.use_smooth=True
    obj.rotation_mode='XYZ';obj.rotation_euler=(0,0,0)      # o glTF chega com quatérnio; o giro das vistas é em graus
    # a peça em pé no chão (z = 0), centrada no eixo z
    V=np.array([v.co[:] for v in obj.data.vertices]);lo,hi=V.min(0),V.max(0)
    obj.data.transform(Matrix.Translation(Vector((-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]))))
    obj.data.update()
    return obj,hi[2]-lo[2]

def lin(h):
    c=np.array([int(h[i:i+2],16)/255 for i in (1,3,5)]);return tuple(np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4))+(1,)
def materiais(obj):
    """plástico acetinado com um verniz fino (06/10: as primeiras saíram foscas e chapadas, "massinha"); as cores da vitrine nas partes coloríveis"""
    for m in obj.data.materials:
        if not m:continue
        m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF')
        if not bs:continue
        nome=m.name.split('.')[0]
        if nome in C['cores']:bs.inputs['Base Color'].default_value=lin(C['cores'][nome])
        r=bs.inputs['Roughness'].default_value
        bs.inputs['Roughness'].default_value=max(.32,min(.55,r)) if nome in ('eyes','features','highlight') else C.get('aspereza',.32)
        # um verniz fino por cima do plástico (o brilho que as fotos da peça têm); 0 = sem
        if 'Coat Weight' in bs.inputs and nome not in ('eyes','features'):bs.inputs['Coat Weight'].default_value=C.get('brilho',.3);bs.inputs['Coat Roughness'].default_value=C.get('brilho_aspereza',.2)
        if 'Coat Weight' in bs.inputs and nome in ('eyes','features'):bs.inputs['Coat Weight'].default_value=C.get('verniz',.1)   # o olho preto brilha um pouco

def cena(altura):
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=C.get('amostras',128)
    sc.cycles.use_adaptive_sampling=True;sc.cycles.adaptive_threshold=.01;sc.cycles.use_denoising=True;sc.cycles.denoiser='OPENIMAGEDENOISE'
    sc.render.resolution_x,sc.render.resolution_y=W,H;sc.render.resolution_percentage=100;sc.render.film_transparent=True
    sc.view_settings.view_transform=C.get('transform','Standard');sc.view_settings.look=C.get('look','Medium High Contrast');sc.view_settings.exposure=C.get('exposicao',-.35)
    sc.cycles.max_bounces=8;sc.cycles.transparent_max_bounces=8
    # céu: o studio.exr do Blender, fraco, só para os reflexos e a luz de preenchimento
    w=bpy.data.worlds.new('estudio');sc.world=w;w.use_nodes=True;nt=w.node_tree;nt.nodes.clear()
    env=nt.nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(os.path.join(bpy.utils.system_resource('DATAFILES',path='studiolights'),'world','studio.exr'))
    bg=nt.nodes.new('ShaderNodeBackground');bg.inputs['Strength'].default_value=C.get('ceu',.32);out=nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs['Color'],bg.inputs['Color']);nt.links.new(bg.outputs['Background'],out.inputs['Surface'])
    # luz principal à esquerda e no alto, menor (sombra e brilho mais definidos); contraluz atrás à direita (contorna a peça); preenchimento fraco
    for nome,pos,energia,tam in (('principal',(-1.6,-2.2,2.6),C.get('luz',190),C.get('tamanho_luz',1.1)),('contraluz',(1.8,2.0,2.4),C.get('contraluz',120),1.6),('preenche',(2.4,-1.4,1.2),C.get('preenche',22),2.5)):
        l=bpy.data.lights.new(nome,'AREA');l.energy=energia*altura**2;l.size=tam*altura;l.shape='DISK'
        o=bpy.data.objects.new(nome,l);sc.collection.objects.link(o);o.location=Vector(pos)*altura
        o.rotation_euler=(Vector((0,0,.45*altura))-o.location).to_track_quat('-Z','Y').to_euler()
    # sem chão: a sombra leve no chão, a mesma das outras fotos, entra depois (tools/galeria-vistas)
    cam=bpy.data.cameras.new('cam');cam.lens=C.get('lente',70);cam.sensor_fit='VERTICAL';cam.sensor_height=24
    co=bpy.data.objects.new('cam',cam);sc.collection.objects.link(co);sc.camera=co
    return sc,co

def projetar(sc,co,P):
    from bpy_extras.object_utils import world_to_camera_view
    return np.array([world_to_camera_view(sc,co,Vector(p))[:2] for p in P])

def enquadrar(sc,co,obj,altura,giro,elev):
    """a peça girada `giro` graus; a câmera de frente, `elev` graus acima, com a peça a 80% da altura e o pé a 8% da borda"""
    obj.rotation_euler=(0,0,math.radians(giro));bpy.context.view_layer.update()
    n=len(obj.data.vertices);A=np.zeros(n*3);obj.data.vertices.foreach_get('co',A);A=A.reshape(-1,3)[::max(1,n//4000)]
    M=np.array(obj.matrix_world);V=A@M[:3,:3].T+M[:3,3]
    alvo=Vector((0,0,altura*.5));d=altura*3;dirc=Vector((0,-math.cos(math.radians(elev)),math.sin(math.radians(elev))))
    co.data.shift_x=co.data.shift_y=0
    for _ in range(4):
        co.location=alvo+dirc*d;co.rotation_euler=(-dirc).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
        p=projetar(sc,co,V);h=p[:,1].max()-p[:,1].min();d*=h/TALL
    co.location=alvo+dirc*d;bpy.context.view_layer.update();p=projetar(sc,co,V)
    co.data.shift_y=p[:,1].min()-BASE;co.data.shift_x=((p[:,0].min()+p[:,0].max())/2-.5)*W/H

def detalhe(sc,co,obj,altura,giro,elev,centro,alto):
    """de perto: o quadro cobre `alto` (fração da altura da peça) em volta da altura `centro` (fração), no meio da peça"""
    obj.rotation_euler=(0,0,math.radians(giro));bpy.context.view_layer.update()
    alvo=Vector((0,0,altura*centro));dirc=Vector((0,-math.cos(math.radians(elev)),math.sin(math.radians(elev))))
    d=alto*altura*co.data.lens/co.data.sensor_height;co.data.shift_x=co.data.shift_y=0
    co.location=alvo+dirc*d;co.rotation_euler=(-dirc).to_track_quat('-Z','Y').to_euler()

limpar();obj,altura=importar(C['modelo']);materiais(obj);sc,co=cena(altura)
os.makedirs(C['saida'],exist_ok=True)
for v in C['vistas']:
    if v.get('detalhe'):detalhe(sc,co,obj,altura,v.get('giro',0),v.get('elev',8),*v['detalhe'])
    else:enquadrar(sc,co,obj,altura,v.get('giro',0),v.get('elev',6))
    sc.render.image_settings.file_format='WEBP';sc.render.image_settings.color_mode='RGBA';sc.render.image_settings.quality=96
    sc.render.filepath=os.path.join(C['saida'],v['id']+'.webp');bpy.ops.render.render(write_still=True)
    print('VISTA',v['id'],'pronta',flush=True)
