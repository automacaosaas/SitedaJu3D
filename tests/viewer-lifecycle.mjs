import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../dist/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const T=await import('../dist/vendor/three.module.js');
const {ProductViewer}=await import('../dist/viewer.js');
const {GLTFLoader}=await import('../dist/vendor/loaders/GLTFLoader.js');
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'node-test-no-textures',loadTexture(){return Promise.resolve(null);}}));return originalParse.apply(this,args);};
const viewer=Object.assign(Object.create(ProductViewer.prototype),{
  active:false,frame:0,scene:new T.Scene(),renderer:{domElement:{hidden:false,setAttribute(){}}},
  reset(){},resize(){},render(){},loop(){}
});
const originalFetch=globalThis.fetch;
let release;
function holdFetch(){
 const gate=new Promise(resolve=>release=resolve);
 globalThis.fetch=async(url,{signal}={})=>{await gate;signal?.throwIfAborted();return new Response(await readFile(url));};
}
const colors={body:'#89cdbc',details:'#efcf59'};
try{
 holdFetch();const closing=viewer.show('borboletoscopio',colors,'Borboleta');viewer.hide();release();
 await assert.rejects(closing,{name:'AbortError'});assert.equal(viewer.active,false);assert.equal(viewer.scene.children.length,0);
 holdFetch();const stale=viewer.show('borboletoscopio',colors,'Borboleta');const current=viewer.show('dinossauroscopio',colors,'Dinossauro');
 viewer.update({body:'#ee8eaa',details:'#183c99'});release();
 await assert.rejects(stale,{name:'AbortError'});assert.equal(await current,true);
 assert.equal(viewer.key,'dinossauroscopio');assert.equal(viewer.scene.children.length,1);assert.equal(viewer.active,true);
 for(const m of viewer.model.parts.get('body'))assert.equal(m.color.getHexString(),'ee8eaa');
 for(const m of viewer.model.parts.get('details'))assert.equal(m.color.getHexString(),'183c99');
 const same=viewer.model;viewer.hide();assert.equal(viewer.renderer.domElement.hidden,true);
 await viewer.show('dinossauroscopio',colors,'Dinossauro');assert.equal(viewer.model,same);assert.equal(viewer.renderer.domElement.hidden,false);
 viewer.hide();viewer.model.dispose();
 console.log('PASS: close during load, product switch during load, latest colors, one scene and cached reopening.');
}finally{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
