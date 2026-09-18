const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
class Element {
  constructor(){this.handlers={};this.style={};this.dataset={};this.attrs={};this.classList={add(){},remove(){}};this.clientWidth=390;}
  addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
  emit(type,props={}){const e={pointerId:1,isPrimary:true,pointerType:'touch',button:0,clientX:220,clientY:160,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...props};for(const h of this.handlers[type]||[])h(e);return e;}
  setAttribute(k,v){this.attrs[k]=v;}
  setPointerCapture(id){this.capture=id;this.emit('lostpointercapture',{pointerId:id,target:cards[0]});}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(){this.capture=null;}
}
const names=['borboletoscopio','dinossauroscopio','aviaoscopia'];
const cards=names.map(name=>{const e=new Element();e.dataset.product=name;e.querySelector=()=>({textContent:name});e.closest=()=>e;return e;});
const stage=new Element(),prev=new Element(),next=new Element(),region=new Element(),count={},status={};stage.querySelectorAll=()=>cards;
const nodes={'.collection':stage,'.gallery-prev':prev,'.gallery-next':next,'.showcase':region,'.gallery-count':count,'#gallery-status':status};
const reduced={matches:false,addEventListener(type,fn){this.change=fn;}};
let now=0,serial=0;const frames=new Map();
const ctx={document:{querySelector:s=>nodes[s],addEventListener(){}},innerWidth:390,matchMedia:q=>q.includes('reduce')?reduced:{matches:true},getComputedStyle:()=>({getPropertyValue:()=>36}),performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},location:{hash:''},Math};
vm.runInNewContext(readFileSync(__dirname+'/../dist/carousel.js','utf8'),ctx);
function flush(){while(frames.size){now+=600;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}}
function active(){return cards.find(c=>c.dataset.front==='true').dataset.product;}
function swipe(dx,dy=0,cancel=false){stage.emit('pointerdown');const move=stage.emit('pointermove',{clientX:220+dx,clientY:160+dy});stage.emit(cancel?'pointercancel':'pointerup',{clientX:220+dx,clientY:160+dy});flush();return move;}
assert.equal(active(),names[0]);
for(let n=1;n<=6;n++){swipe(-100);assert.equal(active(),names[n%3]);const click=stage.emit('click',{target:cards[n%3]});assert.ok(click.prevented,'Swipe must suppress its synthetic click');}
swipe(100);assert.equal(active(),names[2]);
const before=active();assert.ok(!swipe(3,90).prevented,'Vertical scroll must not be prevented');assert.equal(active(),before);
swipe(-100,0,true);assert.equal(active(),before,'Cancelled swipe returns to original product');
stage.emit('pointerdown');stage.emit('pointermove',{clientX:100});stage.capture=null;stage.emit('lostpointercapture',{target:stage});flush();assert.equal(active(),before,'Actual loss of stage capture cancels the gesture');
swipe(16);assert.equal(active(),before,'Small drag must snap back');
stage.emit('pointerdown');stage.emit('pointerup');assert.ok(!stage.emit('click',{target:cards[2]}).prevented,'Simple tap opens centered product');
assert.ok(stage.emit('click',{target:cards[0]}).prevented,'Rear card centers without opening');flush();assert.equal(active(),names[0]);
prev.emit('click');flush();assert.equal(active(),names[2]);next.emit('click');flush();assert.equal(active(),names[0]);
region.emit('keydown',{key:'ArrowLeft'});flush();assert.equal(active(),names[2]);
reduced.matches=true;next.emit('click');assert.equal(frames.size,0);assert.equal(active(),names[0]);
assert.equal(count.textContent,'01 — 03');
now+=1000;
assert.ok(region.emit('wheel',{deltaX:0,deltaY:40,deltaMode:0}).prevented);
assert.equal(active(),names[1],'vertical wheel brings next product');
region.emit('wheel',{deltaX:0,deltaY:100,deltaMode:0});
assert.equal(active(),names[1],'one gesture does not skip products');
now+=700; region.emit('wheel',{deltaX:-40,deltaY:0,deltaMode:0});
assert.equal(active(),names[0],'horizontal trackpad reverses carousel');
now+=700;
assert.ok(!region.emit('wheel',{deltaY:100,deltaX:0,ctrlKey:true}).prevented,'pinch zoom remains native');
region.emit('wheel',{deltaY:1,deltaX:0,deltaMode:1});
assert.equal(active(),names[0],'small wheel delta accumulates');
region.emit('wheel',{deltaY:2,deltaX:0,deltaMode:1});
assert.equal(active(),names[1],'line wheel units are normalized');
console.log('PASS: touch swipes, two loops, reverse loop, vertical scroll, cancellation, small drags, click suppression, center/rear tap, arrows, keyboard, reduced motion, wheel and trackpad.');

