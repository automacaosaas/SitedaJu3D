import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../dist/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const T=await import('../dist/vendor/three.module.js');
const {GLTFLoader}=await import('../dist/vendor/loaders/GLTFLoader.js');

// Coordinates are the GLB's own (x right, y up, z towards the viewer); rays hit the first surface.
for(const key of ['borboletoscopio','dinossauroscopio','aviaoscopia']){
 const bytes=await readFile(new URL(`../dist/assets/models/${key}.glb`,import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);
 const ray=new T.Raycaster();
 const hitFrom=(origin,direction)=>{
  ray.set(new T.Vector3(...origin),new T.Vector3(...direction).normalize());
  const hit=ray.intersectObject(scene,true)[0];assert.ok(hit,`${key}: surface along ${origin} -> ${direction}`);
  const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  return {name:material.name,point:hit.point};
 };
 const front=(x,height)=>hitFrom([x,height,2],[0,0,-1]);
 const back=(x,height)=>hitFrom([x,height,-2],[0,0,1]);
 const materialAt=(x,height,fromBack=false)=>(fromBack?back:front)(x,height).name;
 const side=(height,depth,fromLeft=false)=>hitFrom([fromLeft?-2:2,height,depth],[fromLeft?1:-1,0,0]);
 // Height of a small relief: the centre against the mean of a ring of 8 samples just outside it
 // (same face); a symmetric ring cancels the surface's tilt, a close one keeps its curvature small.
 const relief=(x,height,r,fromBack=false)=>{
  const probe=fromBack?(a,b)=>-back(a,b).point.z:(a,b)=>front(a,b).point.z;
  const around=[...Array(8).keys()].map(k=>probe(x+r*Math.cos(k*Math.PI/4),height+r*Math.sin(k*Math.PI/4)));
  return probe(x,height)-around.reduce((s,v)=>s+v,0)/around.length;
 };
 if(key==='borboletoscopio'){
  for(const sx of [-1,1]){
   assert.equal(materialAt(sx*.083,.549),'eyes','Round pupils remain visible');
   assert.equal(materialAt(sx*.083,.601),'face','The former long black eye tip is face colored');
   // Eyes a little larger than the approved .0285 x .0305 (about +15%), still round.
   assert.equal(materialAt(sx*(.083+.031),.549),'eyes','Eye width grew a little');
   assert.equal(materialAt(sx*(.083+.036),.549),'face','Eye width stays modest');
   assert.equal(materialAt(sx*.083,.549+.033),'eyes','Eye height grew a little');
   assert.equal(materialAt(sx*.083,.549+.038),'face','Eye height stays modest');
   // A thin arched eyebrow above each eye, in the same fixed black as the pupils and the smile.
   for(const [x,y] of [[.084,.6065],[.068,.6045],[.100,.6045]])assert.equal(materialAt(sx*x,y),'eyes','Eyebrow stroke');
   assert.equal(materialAt(sx*.084,.6105),'face','The eyebrow is thin (above it)');
   assert.equal(materialAt(sx*.084,.6025),'face','The eyebrow is thin (below it), apart from the eye');
   assert.equal(materialAt(sx*.464,.063),'details','Front wing dots remain yellow');
   assert.equal(materialAt(sx*.463,.062,true),'details','Back wing dots remain yellow');
   // The small dots are real, discreet domes on both faces (not flat painted circles).
   for(const [x,h,r,fromBack] of [[.4535,-.7016,.0349,false],[.4736,-.6255,.0354,false],[.4390,.5323,.0377,false],
                                  [.4480,-.7098,.0345,true],[.4378,.5250,.0380,true],[.3657,-.7797,.0286,true]]){
    const d=relief(sx*x,h,1.3*r,fromBack);
    assert.ok(d>.15*r&&d<.45*r,`Dot relief at ${sx*x}, ${h} is discreet but perceptible (${d.toFixed(4)} for r=${r})`);
    assert.equal(materialAt(sx*x,h,fromBack),'details','The dome top is the yellow dot');
   }
  }
 }
 if(key==='dinossauroscopio'){
  for(const sx of [-1,1]){
   assert.equal(materialAt(sx*.144,.548),'eyes','Eyes stay aligned at the same height');
   // Intermediate size: larger than the .038 x .0395 version, smaller than the old .048 x .057 eyes.
   assert.equal(materialAt(sx*(.144+.040),.548),'eyes','Eye width grew from the too-small version');
   assert.equal(materialAt(sx*(.144+.052),.548),'body','Eye width stays below the exaggerated original');
   assert.equal(materialAt(sx*.144,.548+.042),'eyes','Eye height grew from the too-small version');
   assert.equal(materialAt(sx*.144,.548+.054),'body','Eye height stays below the exaggerated original');
   assert.ok(relief(sx*.144,.548,.08)>.01,'Eyes are rounded domes set into the head');
   // Then enlarged a little more on request (about +10%, to .0495 x .0517), still under the original height.
   assert.equal(materialAt(sx*(.144+.047),.548),'eyes','Eyes a little larger (width)');
   assert.equal(materialAt(sx*.144,.548+.049),'eyes','Eyes a little larger (height)');
   // A thin, clearly arched and raised eyebrow above each eye (surprised/happy), fixed black like the eyes.
   for(const [x,y] of [[.144,.646],[.124,.6376],[.164,.6376]])assert.equal(materialAt(sx*x,y),'eyes','Eyebrow stroke');
   assert.equal(materialAt(sx*.124,.646),'body','The ends drop well below the top: a real arch');
   assert.equal(materialAt(sx*.144,.652),'body','The eyebrow is thin (above it)');
   assert.equal(materialAt(sx*.144,.6395),'body','The eyebrow is thin (below it), apart from the eye');
   // Four triangular teeth hang from the real mouth line (z = .35 + .75 x^2), evenly spaced.
   for(const [x,y] of [[.046,.335],[.050,.305],[.135,.345],[.144,.325]])assert.equal(materialAt(sx*x,y),'teeth','Tooth body and tip on the mouth line');
   assert.equal(materialAt(sx*.0905,.345),'body','Even gap between the inner and outer teeth');
   assert.equal(materialAt(sx*.046,.3535),'body','Teeth start right under the mouth groove, not above it');
   assert.ok(relief(sx*.046,.322,.02)>.0015,'Teeth are raised from the face');
  }
  assert.equal(materialAt(0,.338),'body','Even gap between the two front teeth');
  assert.equal(materialAt(0,.738),'body','No crest color rectangle on the forehead');
  // Complete crest in profile: every spike is painted from its root (top spike, back wedge, lower spike).
  for(const fromLeft of [false,true]){
   for(const [h,d] of [[.83,-.08],[.68,-.23],[.60,-.30],[.45,-.36]])assert.equal(side(h,d,fromLeft).name,'details','Crest painted along the top and back of the head');
   assert.equal(side(.55,-.10,fromLeft).name,'body','The head itself keeps the body color');
  }
  let teeth=0;scene.traverse(o=>{if(o.material?.name==='teeth'){teeth++;assert.equal(o.material.color.getHexString(),'ffffff','Teeth stay white');}});
  assert.ok(teeth>0);
 }
 if(key==='aviaoscopia'){
  for(const sx of [-1,1]){
   assert.equal(materialAt(sx*.377,.18),'engines','The turbine stays yellow');
   assert.equal(materialAt(sx*.30,.18),'body','No yellow leaks onto the body');
   assert.equal(materialAt(sx*.377,.05),'body','The wing below the turbine stays blue');
   assert.equal(materialAt(sx*.315,.14),'body','The wing root between turbine and fuselage is blue');
   // A clear gap: from beside the turbine, a ray towards the fuselage meets nothing until the wall.
   const toWall=hitFrom([sx*.34,.20,0],[-sx,0,0]);
   assert.equal(toWall.name,'body','Beside the turbine the first surface is the blue fuselage');
   assert.ok(Math.abs(toWall.point.x)<.306&&Math.abs(toWall.point.x)>.29,'That surface is the fuselage wall itself');
  }
  // Regular, upright five-pointed wing stars (same centre on both wings): red along the five tip directions
  // (90, 162, 234, 306 and 18 degrees) and blue between them, where the old crooked stars had their pinched legs.
  for(const sx of [-1,1]){
   for(const a of [90,162,234,306,18])assert.equal(materialAt(sx*.4373+.075*Math.cos(a*Math.PI/180),-.0975+.075*Math.sin(a*Math.PI/180)),'details',`Star tip at ${a} deg`);
   for(const a of [54,126,198,270,342])assert.equal(materialAt(sx*.4373+.075*Math.cos(a*Math.PI/180),-.0975+.075*Math.sin(a*Math.PI/180)),'body',`Gap between star tips at ${a} deg`);
  }
  // The turbines no longer touch or cross the fuselage wall (at |x| ~ .30).
  let nearest=Infinity;
  scene.traverse(o=>{
   if(!o.isMesh||o.material?.name!=='engines')return;
   const p=o.geometry.attributes.position,v=new T.Vector3();
   for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);nearest=Math.min(nearest,Math.abs(v.x));}
  });
  assert.ok(nearest>.325,`Turbines keep a visible gap from the fuselage (closest |x| ${nearest.toFixed(4)})`);
 }
 console.log(`PASS ${key}: targeted material boundaries, relief and fixed details`);
}
