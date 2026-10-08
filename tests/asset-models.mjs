// Uses the same GLB reader as the browser. Textures are skipped in this Node geometry check.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../dist/vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const T=await import('../dist/vendor/three.module.min.js');
const {GLTFLoader}=await import('../dist/vendor/loaders/GLTFLoader.js');
const {PRODUCTS,PALETTE,SOON}=await import('../dist/products.js');
const {createAssetModel,PRESENTATION_SCALE,modelURL}=await import('../dist/asset-models.js');
// The native renderer decodes images in browser checks; no image shim affects geometry.
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'node-test-no-textures',loadTexture(){return Promise.resolve(null);}}));return originalParse.apply(this,args);};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,{signal}={})=>{signal?.throwIfAborted();const b=await readFile(url);return new Response(b,{status:200});};
try{
 for(const key of Object.keys(PRODUCTS).filter(key=>PRODUCTS[key].parts.length)){
  const raw=await readFile(new URL(`../dist/assets/models/${key}.glb`,import.meta.url));
  const json=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
  const expected={borboletoscopio:['body','details','face','eyes','cheeks','highlight'],dinossauroscopio:['body','details','eyes','teeth','highlight'],aviaoscopia:['body','details','engines','fixed']}[key];
  // dinossauroscopio: the Meshy model (05/10/2026) adds the fixed white shine on each eye (highlight), like the monkey
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
  // Os acabamentos (products.js › PALETTE, finish; 08/10/2026). O estúdio de reflexos só é pedido quando uma cor com brilho aparece.
  const studio=new T.Texture();let asked=0;const env=()=>{asked++;return studio;};
  const pick=finish=>PALETTE.find(c=>c.finish===finish),part=PRODUCTS[key].parts[0].id,materials=[...model.parts.get(part)];
  model.setColors({[part]:PALETTE.find(c=>!c.finish)},env);
  assert.equal(asked,0,'matte colors never build the studio');
  const rainbow=pick('rainbow');model.setColors({[part]:rainbow},env);
  for(const m of materials){assert.equal(m.vertexColors,true,'rainbow: painted on the vertices');assert.equal(m.color.getHexString(),'ffffff','rainbow: no tint over the painting');assert.equal(m.envMap,studio,'rainbow: silk reflects the studio');}
  {
   // de baixo para cima, como sai da impressora: o rosa no pé da parte e o verde no alto
   model.group.updateMatrixWorld(true);let low={y:Infinity},high={y:-Infinity};const v=new T.Vector3();
   model.group.traverse(o=>{if(!o.isMesh||!materials.includes(o.material))return;const pos=o.geometry.attributes.position,col=o.geometry.attributes.color;for(let i=0;i<pos.count;i+=7){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);const c=[col.getX(i),col.getY(i),col.getZ(i)];if(v.y<low.y)low={y:v.y,c};if(v.y>high.y)high={y:v.y,c};}});
   const first=new T.Color(rainbow.stops[0]),last=new T.Color(rainbow.stops.at(-1));
   assert.ok(Math.hypot(low.c[0]-first.r,low.c[1]-first.g,low.c[2]-first.b)<.12,`${key}: rainbow starts with ${rainbow.stops[0]} at the bottom`);
   assert.ok(Math.hypot(high.c[0]-last.r,high.c[1]-last.g,high.c[2]-last.b)<.12,`${key}: rainbow ends with ${rainbow.stops.at(-1)} at the top`);
  }
  const dual=pick('dual');model.setColors({[part]:dual},env);
  {
   // as duas cores do fio aparecem, cada uma de um lado
   const [a,b]=dual.stops.map(h=>new T.Color(h));let nearA=0,nearB=0;
   model.group.traverse(o=>{if(!o.isMesh||!materials.includes(o.material))return;const col=o.geometry.attributes.color;for(let i=0;i<col.count;i+=5){const c=[col.getX(i),col.getY(i),col.getZ(i)];if(Math.hypot(c[0]-a.r,c[1]-a.g,c[2]-a.b)<.05)nearA++;if(Math.hypot(c[0]-b.r,c[1]-b.g,c[2]-b.b)<.05)nearB++;}});
   assert.ok(nearA>20&&nearB>20,`${key}: dual shows both colors (${nearA}/${nearB})`);
  }
  const pearl=pick('pearl');model.setColors({[part]:pearl},env);
  for(const m of materials){assert.equal(m.vertexColors,true,'pearl: the swirls painted on the vertices');assert.equal(m.color.getHexString(),'ffffff');assert.ok(m.iridescence>0&&m.sheen>0&&m.envMap===studio,'pearl: sheen and iridescence, reflecting the studio');}
  const metal=pick('metal');model.setColors({[part]:metal},env);
  for(const m of materials)assert.ok(m.metalness>.8&&m.iridescence===0&&m.envMap===studio&&!m.vertexColors&&m.color.getHexString()===metal.hex.slice(1),'metal: metallic in its own color, reflecting the studio');
  model.setColors({[part]:'#89cdbc'},env);
  for(const m of materials){assert.equal(m.envMap,null,'back to matte: no reflection');assert.equal(m.sheen,0);assert.equal(m.iridescence,0);assert.equal(m.vertexColors,false);assert.equal(m.roughness,m.userData.base.roughness,'back to the model\'s own roughness');}
  model.group.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model.group);
  assert.ok(Math.abs(bounds.min.y+1.9)<.001,'Model rests on the existing pedestal');
  assert.ok(Math.abs(bounds.max.y-bounds.min.y-4.1*(PRESENTATION_SCALE[key]||1))<.001,'Consistent fit across products (the butterfly alone is presented larger)');
  for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z])assert.ok(Math.hypot(x,z)<1.9,'The whole product stands within the pedestal');
  if(key==='aviaoscopia'){
   // The real CAD has actual through holes (centres measured on the STL). Repainting must not close them.
   const ray=new T.Raycaster(),direction=new T.Vector3(0,0,-1);
   const hits=(x,y)=>{ray.set(new T.Vector3(x,y,2).applyMatrix4(model.group.matrixWorld),direction);return ray.intersectObject(model.group,true);};
   for(const x of [-.0789,.0793])for(const y of [.383,.2232,.0635,-.0963,-.2561,-.4158,-.5756,-.7353]){
    assert.equal(hits(x,y).length,0,'All sixteen panel openings remain unobstructed');
   }
   assert.ok(hits(.27,-.1).length>0,'Solid frame remains around the openings');
  }
  model.dispose();console.log(`PASS ${key}: GLB loads, logical materials, no tint multiplication, all ${PALETTE.length} colors, the finishes (rainbow, dual, pearl, metal) and consistent bounds.`);
 }
 // The pieces in fixed colours with a 3D preview (the lamps: novelties in SOON until 07/10/2026, now on sale): nothing selectable,
 // the same fit on the pedestal as the products.
 // 2026-10-06: the giraffe and the unicorn have their own models (Rodin, tools/modelo-novidades), each in its fixed colours.
 const NOVELTY_MATERIALS={macacoscopio:['banana','face','features','fur','highlight'],girafoscopio:['coat','features','muzzle','spots'],unicornioscopio:['blue','coat','features','horn','purple']};
 for(const key of [...Object.keys(PRODUCTS).filter(key=>!PRODUCTS[key].parts.length),...Object.keys(SOON)]){
  const raw=await readFile(modelURL(key));
  const json=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
  // The loader reads embedded images through a blob: fetch, which the site's CSP (connect-src) blocks: colours go in the materials.
  assert.equal(json.textures?.length||0,0,`${key}: fixed colours in the materials, no texture`);
  assert.ok(String(modelURL(key)).includes(`/models/${key}.glb`),`${key}: its own model`);
  assert.deepEqual(json.materials.map(m=>m.name).sort(),NOVELTY_MATERIALS[key],`${key}: the materials of its colours`);
  const model=await createAssetModel(key,{},new AbortController().signal);
  assert.equal(model.parts.size,0,`${key}: fixed colours, no selectable part`);
  model.group.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model.group);
  assert.ok(Math.abs(bounds.min.y+1.9)<.001&&Math.abs(bounds.max.y-bounds.min.y-4.1)<.001,`${key}: rests on the pedestal at the shared height`);
  for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z])assert.ok(Math.hypot(x,z)<1.9,`${key}: stands within the pedestal`);
  model.dispose();console.log(`PASS ${key}: novelty model loads, fixed colours and consistent bounds.`);
 }
 const aborted=new AbortController();aborted.abort();await assert.rejects(createAssetModel('borboletoscopio',{},aborted.signal),{name:'AbortError'});
}finally{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
