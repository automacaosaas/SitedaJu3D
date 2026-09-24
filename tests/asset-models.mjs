// Uses the same GLB reader as the browser. Textures are skipped in this Node geometry check.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../dist/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const T=await import('../dist/vendor/three.module.js');
const {GLTFLoader}=await import('../dist/vendor/loaders/GLTFLoader.js');
const {PRODUCTS,PALETTE}=await import('../dist/products.js');
const {createAssetModel}=await import('../dist/asset-models.js');
// The native renderer decodes images in browser checks; no image shim affects geometry.
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'node-test-no-textures',loadTexture(){return Promise.resolve(null);}}));return originalParse.apply(this,args);};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,{signal}={})=>{signal?.throwIfAborted();const b=await readFile(url);return new Response(b,{status:200});};
try{
 for(const key of Object.keys(PRODUCTS)){
  const raw=await readFile(new URL(`../dist/assets/models/${key}.glb`,import.meta.url));
  const json=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
  const expected={borboletoscopio:['body','details','face','eyes'],dinossauroscopio:['body','details','eyes'],aviaoscopia:['body','details','engines','fixed']}[key];
  assert.deepEqual(json.materials.map(m=>m.name).sort(),expected.sort(),'Logical material contract');
  for(const material of json.materials.filter(m=>['body','details','engines'].includes(m.name))){
   assert.equal(material.pbrMetallicRoughness?.baseColorTexture,undefined,'Selected colors never multiply the old color map');
   assert.equal(material.pbrMetallicRoughness?.metallicRoughnessTexture,undefined,'Remove baked metal/roughness artifacts');
  }
  assert.equal(json.textures?.length||0,0,'Repaired surfaces do not retain the old painted facial or PBR maps');
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
   assert.equal(primitive.attributes.COLOR_0,undefined,'No hidden vertex tint multiplies the selected palette');
  }
  const initial={body:'#89cdbc',details:'#efcf59',engines:'#efcf59'};
  const model=await createAssetModel(key,initial,new AbortController().signal);
  assert.deepEqual([...model.parts.keys()].sort(),PRODUCTS[key].parts.map(p=>p.id).sort(),`${key}: every selectable part exists`);
  const fixed=[];model.group.traverse(o=>{if(o.material&&!['body','details','engines'].includes(o.material.name.replace(/\.\d+$/,'')))fixed.push([o.material,o.material.color.getHexString()]);});
  for(const part of PRODUCTS[key].parts)for(const color of PALETTE){
   const before=new Map([...model.parts].flatMap(([id,ms])=>[...ms].map(m=>[m,{id,hex:m.color.getHexString()}])));
   model.setColors({[part.id]:color.hex});
   for(const [material,previous] of before)assert.equal(material.color.getHexString(),previous.id===part.id?color.hex.slice(1):previous.hex,'Only the selected part changes');
   for(const [material,hex] of fixed)assert.equal(material.color.getHexString(),hex,'Fixed facial/cockpit details keep their colors');
  }
  model.group.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model.group);
  assert.ok(Math.abs(bounds.min.y+1.9)<.001,'Model rests on the existing pedestal');
  assert.ok(Math.abs(bounds.max.y-bounds.min.y-4.1)<.001,'Consistent fit across products');
  if(key==='aviaoscopia'){
   // Rodin (6) contains actual through holes. Repainting must not close them.
   const ray=new T.Raycaster(),direction=new T.Vector3(0,0,-1);
   const hits=(x,y)=>{ray.set(new T.Vector3(x,y,2).applyMatrix4(model.group.matrixWorld),direction);return ray.intersectObject(model.group,true);};
   for(const x of [-.08,.08])for(const y of [.397,.241,.087,-.069,-.224,-.380,-.535,-.690]){
    assert.equal(hits(x,y).length,0,'All sixteen panel openings remain unobstructed');
   }
   assert.ok(hits(.27,-.1).length>0,'Solid frame remains around the openings');
  }
  model.dispose();console.log(`PASS ${key}: GLB loads, logical materials, no tint multiplication, all 10 colors and consistent bounds.`);
 }
 const aborted=new AbortController();aborted.abort();await assert.rejects(createAssetModel('borboletoscopio',{},aborted.signal),{name:'AbortError'});
}finally{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
