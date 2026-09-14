import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createModel} from './models.js';

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
  show(key,colors,title){if(this.key!==key){if(this.model){this.scene.remove(this.model.group);this.model.dispose();}this.model=createModel(key,colors);this.scene.add(this.model.group);this.key=key;this.reset();}else this.model.setColors(colors);this.renderer.domElement.setAttribute('aria-label',`Prévia 3D ilustrativa de ${title}`);this.active=true;this.resize();this.render();this.loop();}
  update(colors){this.model?.setColors(colors);this.render();}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render();}
  reset(){this.camera.position.set(1.35,.8,8.3);this.controls.target.set(0,.08,0);this.controls.update();this.render();}
  rotate(direction){const relative=this.camera.position.clone().sub(this.controls.target);relative.applyAxisAngle(new T.Vector3(0,1,0),direction*Math.PI/8);this.camera.position.copy(relative.add(this.controls.target));this.controls.update();this.render();}
  zoom(direction){this.camera.position.sub(this.controls.target).multiplyScalar(direction>0?.87:1.15).add(this.controls.target);this.controls.update();this.render();}
  render(){if(this.active&&!document.hidden)this.renderer.render(this.scene,this.camera);}
  setAuto(value){this.auto=value;this.controls.autoRotate=value;this.stop();this.loop();}
  loop(){if(!this.active||!this.auto||document.hidden||this.frame)return;this.last=performance.now();const tick=now=>{this.frame=0;if(!this.active||!this.auto||document.hidden)return;this.controls.update(Math.min((now-this.last)/1000,.1));this.last=now;this.render();this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
  stop(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
  hide(){this.active=false;this.stop();}
  dispose(){this.hide();this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.controls.dispose();this.model?.dispose();this.pedestal.geometry.dispose();this.pedestal.material.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}

