// The Macacoscópio from the site's 3D preview (dist/assets/models/macacoscopio.glb: the Rodin model with its fixed colours, see
// tools/modelo-macaco/), placed like buildMonkey() so the vitrine camera and the slit lamp layers keep their places: millimetres at the
// lamp's scale, the sleeve's bottom centre at the origin, x right, y up, z toward the viewer. Same height as the procedural monkey.
// The colours come from the model; the finish is the studio's printed plastic (light clearcoat, glossy eyes), like the other renders.
import * as THREE from 'three';
import {GLTFLoader} from '/vendor/loaders/GLTFLoader.js';
import {MeshoptDecoder} from '/vendor/libs/meshopt_decoder.module.js';
import {MONKEY} from './monkey.js';

const FINISH = {
  fur: {roughness: .52, clearcoat: .28, clearcoatRoughness: .42},
  face: {roughness: .52, clearcoat: .28, clearcoatRoughness: .42},
  banana: {roughness: .4, clearcoat: .45},
  features: {roughness: .12, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.3},
  highlight: {roughness: .3, clearcoat: 1}
};

export async function loadRodinMonkey(url = '/assets/models/macacoscopio.glb', height = MONKEY.HEAD_Y0 + MONKEY.HEAD_H) {
  const model = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), span = box.max.y - box.min.y, rim = [];
  // the sleeve's axis: the centre of its top rim (the face and the ears stick out, so not the centre of the box)
  model.traverse(o => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > box.max.y - .03 * span) rim.push(v.clone()); }
    o.castShadow = true; o.receiveShadow = true;
    const name = o.material.name.replace(/\.\d+$/, '');
    o.material = new THREE.MeshPhysicalMaterial({color: o.material.color, envMapIntensity: .95, side: THREE.DoubleSide, ...(FINISH[name] || FINISH.fur)});
  });
  const cx = rim.reduce((s, v) => s + v.x, 0) / rim.length, cz = rim.reduce((s, v) => s + v.z, 0) / rim.length;
  model.position.set(-cx, -box.min.y, -cz);
  const root = new THREE.Group(); root.add(model); root.scale.setScalar(height / span);
  return root;
}
