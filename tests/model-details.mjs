import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../dist/vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const T=await import('../dist/vendor/three.module.min.js');
const {GLTFLoader}=await import('../dist/vendor/loaders/GLTFLoader.js');
const {MeshoptDecoder}=await import('../dist/vendor/libs/meshopt_decoder.module.js');

// Coordinates are the GLB's own (x right, y up, z towards the viewer); rays hit the first surface.
for(const key of ['borboletoscopio','dinossauroscopio','aviaoscopia','macacoscopio']){
 const bytes=await readFile(new URL(`../dist/assets/models/${key}.glb`,import.meta.url));
 const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
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
  // The Meshy model (05/10/2026, tools/modelo-dino/meshy/preparar_meshy.py), with the new piece's two-spike crest. Body and details are
  // painted by the site; black eyes and eyebrows, white teeth and a white oval shine on each eye are fixed. No texture (the site's CSP).
  for(const sx of [-1,1]){
   assert.equal(materialAt(sx*.18,.57),'eyes','Black eye');
   // The shine is the raised oval on the upper outer part of each eye, the same (mirrored) on both.
   for(const [x,y] of [[.2133,.614],[.225,.624],[.203,.606]])assert.equal(materialAt(sx*x,y),'highlight',`White oval shine (${sx*x}, ${y})`);
   assert.equal(materialAt(sx*.265,.59),'body','The eye ends at its groove (outer side)');
   assert.equal(materialAt(sx*.17,.69),'body','Head between the eye and the eyebrow');
   assert.equal(materialAt(sx*.169,.733),'eyes','Black eyebrow');
   assert.equal(materialAt(sx*.169,.76),'body','The eyebrow is thin (above it)');
   // Four teeth hanging from the mouth line, two on each side, with the head between them.
   for(const [x,y] of [[.056,.335],[.19,.35]])assert.equal(materialAt(sx*x,y),'teeth',`Tooth at ${sx*x}`);
   assert.equal(materialAt(sx*.12,.35),'body','Gap between the inner and outer teeth');
   for(const [x,y] of [[.04,.46],[.12,.45]])assert.equal(materialAt(sx*x,y),'body','Nostrils and cheeks keep the body color');
   // Five raised dots on the outer side of each foot, in the details color.
   assert.equal(side(-.827,-.043,sx<0).name,'details','Foot dot');
   assert.equal(side(-.75,-.06,sx<0).name,'body','Foot between the dots');
  }
  for(const y of [.36,.40])assert.equal(materialAt(0,y),'body','Even gap between the two front teeth, and the lip above them');
  assert.equal(materialAt(0,.70),'body','Plain forehead');
  // Two crest spikes like the new piece: one on top of the head and one behind it, nothing at the nape (it touched the user's nose).
  for(const fromLeft of [false,true]){
   assert.equal(side(.88,-.108,fromLeft).name,'details','Top spike');
   assert.equal(side(.69,-.313,fromLeft).name,'details','Back spike');
   assert.equal(side(.6,-.05,fromLeft).name,'body','The head itself keeps the body color');
  }
  assert.equal(back(0,.69).name,'details','Back spike seen from behind');
  assert.equal(back(0,.45).name,'body','No third spike at the nape');
  assert.equal(hitFrom([0,2,.1],[0,-1,0]).name,'body','Top of the head in front of the spike');
  const names=new Set();let teeth=0;
  scene.traverse(o=>{if(!o.isMesh)return;names.add(o.material.name);if(o.material.name==='teeth'){teeth++;assert.equal(o.material.color.getHexString(),'ffffff','Teeth stay white');}});
  assert.ok(teeth>0);
  assert.deepEqual([...names].sort(),['body','details','eyes','highlight','teeth'],'Five plain materials');
 }
 if(key==='aviaoscopia'){
  // The real CAD (STL of 21/08/2026, tools/render-aviao-macaco/export-glb.cjs), 1 GLB unit = 122 mm, centred on the airplane.
  for(const sx of [-1,1]){
   assert.equal(materialAt(sx*.385,.14),'engines','The turbine stays yellow');
   assert.equal(materialAt(sx*.30,.14),'body','No yellow leaks onto the fuselage beside it');
   assert.equal(materialAt(sx*.385,.03),'body','The wing below the turbine stays blue');
   // Regular, upright five-pointed wing stars: red along the five tip directions (90, 162, 234, 306 and 18 degrees), blue between them.
   for(const a of [90,162,234,306,18])assert.equal(materialAt(sx*.4465+.055*Math.cos(a*Math.PI/180),-.1286+.055*Math.sin(a*Math.PI/180)),'details',`Star tip at ${a} deg`);
   for(const a of [54,126,198,270,342])assert.equal(materialAt(sx*.4465+.055*Math.cos(a*Math.PI/180),-.1286+.055*Math.sin(a*Math.PI/180)),'body',`Gap between star tips at ${a} deg`);
   assert.equal(materialAt(sx*.08,.66),'fixed','The cockpit windows keep their own colour');
  }
  assert.equal(materialAt(0,.66),'body','The frame between the windows is the body');
  assert.equal(materialAt(0,.85),'details','The nose cap takes the detail colour');
  // Sixteen through openings, two columns by eight rows: a ray through each centre crosses both halves without touching them.
  for(const x of [-.0789,.0793])for(const y of [.383,.2232,.0635,-.0963,-.2561,-.4158,-.5756,-.7353]){
   for(const z of [2,-2]){ray.set(new T.Vector3(x,y,z),new T.Vector3(0,0,-Math.sign(z)));assert.equal(ray.intersectObject(scene,true).length,0,`Opening at ${x}, ${y} is open from ${z>0?'the front':'the back'}`);}
  }
  // The turbines stand on the wings, outside the fuselage wall (at |x| ~ .32 at their height).
  let nearest=Infinity;
  scene.traverse(o=>{
   if(!o.isMesh||o.material?.name!=='engines')return;
   const p=o.geometry.attributes.position,v=new T.Vector3();
   for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(v.y>.1)nearest=Math.min(nearest,Math.abs(v.x));}
  });
  assert.ok(nearest>.31,`The turbines sit outside the fuselage (closest |x| ${nearest.toFixed(4)})`);
 }
 if(key==='macacoscopio'){
  // The Meshy model (03/10/2026) with the monkey's fixed colours as five materials (no texture: the site's CSP blocks the blob: fetch of
  // embedded images). Brown fur and feet (the paw prints are relief); beige face plate, belly and inner ears; black eyes, brows, nose
  // and mouth; a white shine on each eye; banana.
  for(const [x,y] of [[-.147,.563],[.142,.563]])assert.equal(materialAt(x,y),'features','Black eyes');
  for(const [x,y] of [[-.128,.63],[.131,.641]])assert.equal(materialAt(x,y),'highlight','Each eye keeps its white shine');
  // The shine is a whole oval, the same on both eyes (it came out as a crescent on one of them): white 2 cm above and below its centre.
  for(const [x,y] of [[-.1285,.644],[.1292,.643]])for(const dy of [-.02,.02])assert.equal(materialAt(x,y+dy),'highlight',`Whole oval shine (${x}, ${dy})`);
  // Seen from above, the top of the nose is black too (faces hidden from the front view were left brown).
  for(const x of [-.02,0,.02])assert.equal(hitFrom([x,1.5,.405],[0,-1,0]).name,'features',`Top of the nose, from above (${x})`);
  // No brown spikes on the belly plate beside the fists, and its bottom edge is a smooth curve (Meshy's had a notch near the middle).
  for(const [x,y] of [[-.165,-.1],[.165,-.1],[-.165,-.15],[.165,-.15]])assert.equal(materialAt(x,y),'face','Plain beige plate beside the fists');
  for(const x of [-.03,.03]){
   assert.equal(materialAt(x,-.655),'face',`Bottom of the plate, no notch (${x})`);
   assert.equal(materialAt(x,-.675),'fur',`Brown below the plate (${x})`);
  }
  for(const [x,y] of [[-.13,.753],[.129,.753]])assert.equal(materialAt(x,y),'features','Black brows');
  assert.equal(materialAt(0,.513),'features','Black nose');
  for(const [x,y] of [[-.19,.45],[.19,.45],[0,.74],[-.05,.66],[0,.42]])assert.equal(materialAt(x,y),'face','Beige face plate and muzzle');
  for(const [x,y] of [[0,0],[0,-.6],[.15,-.4],[-.416,.647],[.414,.647]])assert.equal(materialAt(x,y),'face','Beige belly and inner ears');
  for(const [x,y] of [[-.055,-.458],[0,-.43],[.1,-.33]])assert.equal(materialAt(x,y),'banana','Yellow banana');
  for(const [x,y] of [[-.32,.1],[.32,.1],[0,.28],[0,.88],[-.3,-.5],[.3,-.5]])assert.equal(materialAt(x,y),'fur','Brown fur around the face and the belly');
  for(const [x,y] of [[-.416,.83],[-.53,.65],[.414,.83],[.53,.65]])assert.equal(materialAt(x,y),'fur','The ear rim and its outside stay brown');
  for(const [x,y] of [[.2,.4],[-.2,-.5]])assert.equal(materialAt(x,y,true),'fur','The back is plain brown');
  for(const [x,y] of [[-.142,-.3],[0,-.1],[-.12,.57],[.12,.57]])assert.equal(hitFrom([x,y,0],[0,0,1]).name,'fur','The inside of the tube is brown, behind the eyes too');
  // The paw prints, remade (Meshy's were lopsided): brown, raised the same on both feet.
  for(const [x,y] of [[-.146,-.862],[.145,-.862],[-.12,-.79],[.12,-.79],[-.31,-.84],[0,-.84]])assert.equal(materialAt(x,y),'fur','Brown feet, pads, toes and around them');
  const padL=relief(-.146,-.862,.07),padR=relief(.145,-.862,.07);
  assert.ok(padL>.002&&padR>.002&&Math.abs(padL-padR)<.0005,`Both pads raised alike (${padL.toFixed(4)}, ${padR.toFixed(4)})`);
  const axis=[-.0005,-.042];
  // No pocket around the root of the arms (Meshy left one, ~2.5 cm deep, behind each shoulder): from outside, the first surface there is
  // the brown outer shell.
  for(const s of [-1,1])for(const y of [-.03,.03,.09])for(const a of [112,120,128]){
   const t=a*Math.PI/180,d=new T.Vector3(s*Math.sin(t),0,Math.cos(t)),o=new T.Vector3(axis[0],y,axis[1]);
   const hit=hitFrom(o.clone().addScaledVector(d,1.5).toArray(),d.clone().negate().toArray());
   assert.equal(hit.name,'fur','Brown shell behind the shoulder');
   assert.ok(Math.hypot(hit.point.x-axis[0],hit.point.z-axis[1])>.345,`No pocket behind the ${s<0?'left':'right'} shoulder (${a} deg, ${y})`);
  }
  // Smooth inside: no hollow behind the belly plate (it was ~5 cm deep); the bore only ripples a few millimetres.
  let lo=Infinity,hi=0;
  for(let y=-.6;y<=.2;y+=.02)for(let a=-40;a<=40;a+=5){
   const t=a*Math.PI/180,p=hitFrom([axis[0],y,axis[1]],[Math.sin(t),0,Math.cos(t)]).point,r=Math.hypot(p.x-axis[0],p.z-axis[1]);lo=Math.min(lo,r);hi=Math.max(hi,r);
  }
  assert.ok(hi-lo<.012,`The inside of the belly is smooth (radius ${lo.toFixed(4)} to ${hi.toFixed(4)})`);
  // Open at the top, like the printed piece (the lamp column passes through), and the opening is round: the narrowest ring of the
  // lip, seen from its own centre, is a circle.
  ray.set(new T.Vector3(axis[0],1.5,axis[1]),new T.Vector3(0,-1,0));assert.equal(ray.intersectObject(scene,true).length,0,'The head is open at the top');
  const lip=[...Array(36).keys()].map(k=>hitFrom([axis[0],.915,axis[1]],[Math.sin(k*Math.PI/18),0,Math.cos(k*Math.PI/18)]).point);
  // circle through the points by least squares (x²+z² = 2a·x + 2b·z + c): the centre of the opening, not of the tube
  const M=[[0,0,0],[0,0,0],[0,0,0]],v=[0,0,0];
  for(const p of lip){const row=[2*p.x,2*p.z,1],w=p.x*p.x+p.z*p.z;for(let i=0;i<3;i++){v[i]+=row[i]*w;for(let j=0;j<3;j++)M[i][j]+=row[i]*row[j];}}
  const det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const col=k=>M.map((r,i)=>r.map((x,j)=>j===k?v[i]:x)),D=det(M),cx=det(col(0))/D,cz=det(col(1))/D,rs=lip.map(p=>Math.hypot(p.x-cx,p.z-cz));
  assert.ok(Math.max(...rs)-Math.min(...rs)<.004,`The top opening is round (radius ${Math.min(...rs).toFixed(4)} to ${Math.max(...rs).toFixed(4)})`);
 } console.log(`PASS ${key}: targeted material boundaries, relief and fixed details`);
}
