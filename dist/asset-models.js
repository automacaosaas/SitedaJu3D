import * as T from 'three';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';

const ASSETS={
  borboletoscopio:new URL('./assets/models/borboletoscopio.glb',import.meta.url),
  dinossauroscopio:new URL('./assets/models/dinossauroscopio.glb',import.meta.url),
  aviaoscopia:new URL('./assets/models/aviaoscopia.glb?v=rodin6-pintura',import.meta.url)
};

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
  const gltf=await new GLTFLoader().parseAsync(data,'');
  const group=gltf.scene;
  if(signal?.aborted){disposeAsset(group);signal.throwIfAborted();}
  const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0){disposeAsset(group);throw new Error('Dimensões do modelo inválidas');}
  const center=bounds.getCenter(new T.Vector3()),scale=4.1/size.y;
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
