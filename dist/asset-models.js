import * as T from 'three';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/libs/meshopt_decoder.module.js';

// GLBs are Meshopt-compressed (EXT_meshopt_compression, 16-bit positions); see PERFORMANCE-QA.md. Bump `v` whenever a
// model file changes so browsers holding the cached copy fetch the new one.
const ASSETS={
  borboletoscopio:new URL('./assets/models/borboletoscopio.glb?v=olhos-meshopt2',import.meta.url),
  dinossauroscopio:new URL('./assets/models/dinossauroscopio.glb?v=dentes-meshopt3',import.meta.url),
  aviaoscopia:new URL('./assets/models/aviaoscopia.glb?v=cad-21-08-meshopt1',import.meta.url),
  // O macaco do Meshy com as cores fixas do macaco em cinco materiais, sem textura (VITRINE-AVIAO-MACACO-QA.md)
  macacoscopio:new URL('./assets/models/macacoscopio.glb?v=meshy-1',import.meta.url)
};
// Every product is fitted to the same 4.1 height; the butterfly's thin wings and antennae read small
// at that height, so it alone is presented larger (proportions, camera and lighting unchanged).
export const PRESENTATION_SCALE={borboletoscopio:1.25};

export function disposeAsset(group){
  const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  group.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture){textures.add(value);if(value.image)images.add(value.image);}
    }
  });
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
  images.forEach(i=>i.close?.());materials.forEach(m=>m.dispose());
}

export async function createAssetModel(key,colors,signal){
  if(!Object.hasOwn(ASSETS,key))throw new Error('Produto sem modelo 3D');
  const response=await fetch(ASSETS[key],{signal});
  if(!response.ok)throw new Error(`Modelo 3D: HTTP ${response.status}`);
  const data=await response.arrayBuffer();signal?.throwIfAborted();
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data,'');
  const group=gltf.scene;
  if(signal?.aborted){disposeAsset(group);signal.throwIfAborted();}
  const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0){disposeAsset(group);throw new Error('Dimensões do modelo inválidas');}
  const center=bounds.getCenter(new T.Vector3()),scale=4.1*(PRESENTATION_SCALE[key]||1)/size.y;
  const wrapper=new T.Group();wrapper.name=key;wrapper.add(group);
  wrapper.scale.setScalar(scale);wrapper.position.set(-center.x*scale,-1.9-bounds.min.y*scale,-center.z*scale);
  const parts=new Map();
  group.traverse(object=>{
    // Dense, thin Rodin surfaces produce shadow-map acne. Keep their pedestal
    // shadows, while lighting the model itself without the coarse shadow map.
    if(!object.isMesh)return;object.castShadow=true;object.receiveShadow=false;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      const part=material.name.replace(/\.\d+$/,'');
      if(['body','details','engines'].includes(part)){
        if(!parts.has(part))parts.set(part,new Set());parts.get(part).add(material);
      }
    }
  });
  function setColors(selection){for(const [part,materials] of parts){if(selection[part])materials.forEach(m=>m.color.set(selection[part]));}}
  setColors(colors);
  return {group:wrapper,parts,setColors,dispose(){disposeAsset(wrapper);}};
}
