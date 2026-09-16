import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../dist/vendor/three.module.js';

// The text canvas is stubbed; raycasts use the production Three.js geometry.
globalThis.document={createElement(){return {getContext(){return {fillText(){}};}};}};
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
const source=(await readFile(new URL('../dist/models.js',import.meta.url),'utf8')).replace("from 'three'",`from '${threeURL}'`);
const {createModel}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const colors={body:'#183c99',details:'#db354c',engines:'#efcf59'};
const model=createModel('aviaoscopia',colors),group=model.group;
group.updateMatrixWorld(true);
const rack=group.getObjectByName('sixteen-aperture-rack');
assert.equal(rack.geometry.parameters.shapes.holes.length,16);
const ray=new T.Raycaster();
function hits(objects,origin,direction){ray.set(new T.Vector3(...origin),new T.Vector3(...direction));return ray.intersectObjects(objects,false);}
const expected=[[.5,1,1.5,2,2.5,3,3.5,4],[5,6,7,8,9,10,12,15]];
for(let col=0;col<2;col++)for(let row=0;row<8;row++){
  const lens=group.getObjectByName(`lens-${col}-${row}`);
  assert.equal(lens.userData.diopters,expected[col][row]);
  assert.equal(hits([rack],[lens.position.x,lens.position.y,2],[0,0,-1]).length,0,'Every aperture must pass through the insert');
}
assert.ok(hits([rack],[0,0,2],[0,0,-1]).length,'The insert must retain material between columns');
const body=group.children.filter(m=>m.userData.part==='body');
assert.equal(hits(body,[0,-1.72,2],[0,0,-1]).length,0,'The rectangular mouth must be open');
assert.equal(hits(body,[.16,-1.72,2],[0,0,-1]).length,0,'The slot must accommodate a flat stem, not a round pin');
const underside=hits(body,[0,-3,0],[0,1,0]);
assert.ok(underside.length&&underside[0].point.y> -1.7,'The stem channel must continue through the underside');
const originalRim=model.materials['lens-rim'].color.getHex();
model.setColors({...colors,body:'#f4f1ed'});
assert.equal(model.materials['degree-0-0'].color.getHexString(),'26303c');
assert.equal(model.materials['lens-rim'].color.getHex(),originalRim);
model.setColors(colors);
assert.equal(model.materials['degree-0-0'].color.getHexString(),'f5f5ef');
model.dispose();
for(const key of ['borboletoscopio','dinossauroscopio'])createModel(key,colors).dispose();
console.log('PASS: 16 through-apertures, exact degree ordering, open rectangular stem channel, label contrast and unchanged fixed materials.');
