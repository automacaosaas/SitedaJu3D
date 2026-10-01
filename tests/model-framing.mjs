// Framing with the real ProductViewer.fit()/rotate(): nothing is cut at any rotation or at the orbit's
// polar limits, and the butterfly's presentation scale makes it larger where the layout allows it.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../dist/vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const T=await import('../dist/vendor/three.module.min.js');
const {GLTFLoader}=await import('../dist/vendor/loaders/GLTFLoader.js');
const {ProductViewer}=await import('../dist/viewer.js');
const assets=await import('../dist/asset-models.js');
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'node-test-no-textures',loadTexture(){return Promise.resolve(null);}}));return originalParse.apply(this,args);};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(await readFile(url),{status:200});
// 3D areas measured in the product modal (CSS px): desktop, tablet and phones.
const HOSTS=[[519,741],[519,679],[519,587],[484,558],[356,750],[402,215],[362,186],[332,169]];
function viewerFor(model,[w,h],width=w){
 // Same pedestal as ProductViewer's constructor (which needs WebGL, unavailable here).
 const pedestal=new T.Mesh(new T.CylinderGeometry(1.9,1.9,.24,80));pedestal.position.y=-2.02;pedestal.updateMatrixWorld(true);
 const v=Object.assign(Object.create(ProductViewer.prototype),{
  camera:new T.PerspectiveCamera(36,w/h,.1,50),controls:{target:new T.Vector3(),update(){},minDistance:0,maxDistance:0},
  pedestal,model,render(){},width   // phones (≤ 480 px) frame the piece without the pedestal (audit D4)
 });
 v.camera.position.set(1.1,.65,8.3);v.fit();return v;
}
function samples(group){
 const pts=[],v=new T.Vector3();group.updateMatrixWorld(true);
 group.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i+=5)pts.push(v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).clone());});
 return pts;
}
try{
 const heights={};
 for(const key of ['borboletoscopio','dinossauroscopio','aviaoscopia']){
  const model=await assets.createAssetModel(key,{},new AbortController().signal);const pts=samples(model.group);
  for(const host of HOSTS){
   const v=viewerFor(model,host);const target=v.controls.target;
   const look=()=>{v.camera.lookAt(target);v.camera.updateMatrixWorld(true);};
   const e0=(()=>{look();let x=0,y=0,a=Infinity,b=-Infinity;const p=new T.Vector3();for(const q of pts){p.copy(q).project(v.camera);x=Math.max(x,Math.abs(p.x));y=Math.max(y,Math.abs(p.y));a=Math.min(a,p.y);b=Math.max(b,p.y);}return {x,y,height:(b-a)/2};})();
   heights[`${key}@${host}`]=e0.height;
   // Phones (audit D4): framed without the pedestal, every piece reads clearly larger than when the pedestal set the frame.
   if(host[0]<=480&&host[1]>host[0]){
    const wide=viewerFor(model,host,1000);wide.camera.lookAt(wide.controls.target);wide.camera.updateMatrixWorld(true);
    let a=Infinity,b=-Infinity;const p=new T.Vector3();for(const q of pts){p.copy(q).project(wide.camera);a=Math.min(a,p.y);b=Math.max(b,p.y);}
    assert.ok(e0.height>1.2*(b-a)/2,`${key} ${host}: larger on a phone (${e0.height.toFixed(2)} vs ${((b-a)/2).toFixed(2)})`);
   }
   for(let step=0;step<16;step++){           // the viewer's rotate buttons turn by PI/8
    v.rotate(1);look();let m=0;const p=new T.Vector3();for(const q of pts){p.copy(q).project(v.camera);m=Math.max(m,Math.abs(p.x),Math.abs(p.y));}
    assert.ok(m<.98,`${key} ${host}: fully visible at rotation ${step+1}/16 (${m.toFixed(3)})`);
   }
   const radius=v.camera.position.distanceTo(target);
   for(const phi of [.4,Math.PI*.78])for(let a=0;a<360;a+=15){  // OrbitControls polar limits
    v.camera.position.copy(target).add(new T.Vector3().setFromSphericalCoords(radius,phi,a*Math.PI/180));look();
    let m=0;const p=new T.Vector3();for(const q of pts){p.copy(q).project(v.camera);m=Math.max(m,Math.abs(p.x),Math.abs(p.y));}
    assert.ok(m<.98,`${key} ${host}: fully visible at the polar limit ${phi.toFixed(2)}, azimuth ${a}`);
   }
  }
  model.dispose();
 }
 // Without the exception the butterfly would be as tall as the others; with it, it is larger on desktop.
 const saved=assets.PRESENTATION_SCALE.borboletoscopio;
 try{
  assets.PRESENTATION_SCALE.borboletoscopio=1;
  const plain=await assets.createAssetModel('borboletoscopio',{},new AbortController().signal);const pts=samples(plain.group);
  for(const host of [[519,741],[519,679]]){   // on phones every piece fills the frame (audit D4), so the exception only matters on wider screens
   const v=viewerFor(plain,host);v.camera.lookAt(v.controls.target);v.camera.updateMatrixWorld(true);
   let a=Infinity,b=-Infinity;const p=new T.Vector3();for(const q of pts){p.copy(q).project(v.camera);a=Math.min(a,p.y);b=Math.max(b,p.y);}
   assert.ok(heights[`borboletoscopio@${host}`]>1.15*(b-a)/2,`The butterfly is presented clearly larger at ${host}`);
  }
  plain.dispose();
 }finally{assets.PRESENTATION_SCALE.borboletoscopio=saved;}
 console.log('PASS: no product is cut at any rotation or polar limit on 8 layouts; the butterfly is presented larger.');
}finally{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
