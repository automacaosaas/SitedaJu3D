import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createAssetModel} from './asset-models.js';

export class ProductViewer{
  constructor(host,onError){
    this.host=host;this.onError=onError;this.active=false;this.frame=0;this.auto=false;
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','Prévia 3D do produto');canvas.setAttribute('role','img');host.append(canvas);
    this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(36,1,.1,50);
    this.scene.add(new T.HemisphereLight(0xffffff,0xb4a9b6,1.6));
    const key=new T.DirectionalLight(0xfff4ee,2.5);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.bias=-.0005;this.scene.add(key);
    const fill=new T.DirectionalLight(0xe7f1ff,1.5);fill.position.set(4,2,-3);this.scene.add(fill);
    this.pedestal=new T.Mesh(new T.CylinderGeometry(1.9,1.9,.24,80),new T.MeshStandardMaterial({color:'#fffafa',roughness:.72}));this.pedestal.position.y=-2.02;this.pedestal.receiveShadow=true;this.scene.add(this.pedestal);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enablePan=false;this.controls.enableDamping=false;this.controls.minDistance=5;this.controls.maxDistance=13;this.controls.minPolarAngle=.4;this.controls.maxPolarAngle=Math.PI*.78;this.controls.rotateSpeed=.75;this.controls.autoRotateSpeed=1.4;
    this.controls.addEventListener('change',()=>this.render());
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    this.visibility=()=>{if(document.hidden)this.stop();else if(this.active){this.render();this.loop();}};document.addEventListener('visibilitychange',this.visibility);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.active=false;this.stop();onError();});
    this.reset();
  }
  async show(key,colors,title){
    this.hide();const version=this.loadVersion;this.colors=colors;
    if(this.key!==key){
      if(this.model){this.scene.remove(this.model.group);this.model.dispose();this.model=null;this.key=null;}
      this.loadController=new AbortController();
      const model=await createAssetModel(key,colors,this.loadController.signal);
      if(version!==this.loadVersion){model.dispose();return false;}
      this.model=model;this.scene.add(model.group);this.key=key;this.reset();
    }
    this.model.setColors(this.colors);
    this.renderer.domElement.setAttribute('aria-label',`Modelo 3D de ${title}`);
    this.renderer.domElement.hidden=false;this.active=true;this.resize();this.render();this.loop();return true;
  }
  update(colors){this.colors=colors;this.model?.setColors(colors);this.render();}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;const changed=w!==this.width||h!==this.height;this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(changed)this.fit();this.render();}
  fit(){
    if(!this.model)return;
    const bounds=new T.Box3().setFromObject(this.model.group);bounds.union(new T.Box3().setFromObject(this.pedestal));
    const center=bounds.getCenter(new T.Vector3());
    const vertical=T.MathUtils.degToRad(this.camera.fov/2),horizontal=Math.atan(Math.tan(vertical)*this.camera.aspect);
    const direction=this.camera.position.clone().sub(this.controls.target).normalize();
    if(!direction.lengthSq())direction.set(.1,.07,1).normalize();
    const right=new T.Vector3().crossVectors(this.camera.up,direction).normalize(),up=new T.Vector3().crossVectors(direction,right);
    let distance=0;
    // Fit the actual projected bounds, including the pedestal, with a safe margin.
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const p=new T.Vector3(x,y,z).sub(center);
      distance=Math.max(distance,p.dot(direction)+1.1*Math.max(Math.abs(p.dot(right))/Math.tan(horizontal),Math.abs(p.dot(up))/Math.tan(vertical)));
    }
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance);
    this.controls.minDistance=distance*.65;this.controls.maxDistance=distance*2;
    this.camera.far=Math.max(50,distance*4);this.camera.updateProjectionMatrix();this.controls.update();
  }
  reset(){this.controls.target.set(0,0,0);this.camera.position.set(1.1,.65,8.3);this.fit();this.controls.update();this.render();}
  rotate(direction){const relative=this.camera.position.clone().sub(this.controls.target);relative.applyAxisAngle(new T.Vector3(0,1,0),direction*Math.PI/8);this.camera.position.copy(relative.add(this.controls.target));this.controls.update();this.render();}
  zoom(direction){this.camera.position.sub(this.controls.target).multiplyScalar(direction>0?.87:1.15).add(this.controls.target);this.controls.update();this.render();}
  render(){if(this.active&&!document.hidden)this.renderer.render(this.scene,this.camera);}
  setAuto(value){this.auto=value;this.controls.autoRotate=value;this.stop();this.loop();}
  loop(){if(!this.active||!this.auto||document.hidden||this.frame)return;this.last=performance.now();const tick=now=>{this.frame=0;if(!this.active||!this.auto||document.hidden)return;this.controls.update(Math.min((now-this.last)/1000,.1));this.last=now;this.render();this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
  stop(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
  snapshot(){
    if(!this.active||!this.model)return null;
    // A dedicated square camera keeps the cart thumbnail legible at every viewport.
    const bounds=new T.Box3().setFromObject(this.model.group);bounds.union(new T.Box3().setFromObject(this.pedestal));
    const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),extent=Math.max(size.x,size.y,size.z)*.6;
    const camera=new T.OrthographicCamera(-extent,extent,extent,-extent,.1,50);
    camera.position.copy(center).add(new T.Vector3(.55,.4,12));camera.lookAt(center);
    try{this.renderer.setSize(320,320,false);this.renderer.render(this.scene,camera);return this.renderer.domElement.toDataURL('image/png');}
    finally{this.renderer.setSize(this.width,this.height,false);this.render();}
  }
  hide(){this.loadVersion=(this.loadVersion||0)+1;this.loadController?.abort();this.active=false;this.stop();this.renderer.domElement.hidden=true;}
  dispose(){this.hide();this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.controls.dispose();this.model?.dispose();this.pedestal.geometry.dispose();this.pedestal.material.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
