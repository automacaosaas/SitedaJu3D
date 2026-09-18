// One continuous angle drives position, depth and scale on every screen size.
const stage=document.querySelector('.collection');
const cards=[...stage.querySelectorAll('.product')];
const count=document.querySelector('.gallery-count');
const status=document.querySelector('#gallery-status');
const region=document.querySelector('.showcase');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const total=cards.length, step=2*Math.PI/total;
const mod=n=>((n%total)+total)%total;
let position=0,target=0,frame=0,gesture=null,suppressUntil=0;
let radius=0,rise=0,stride=0;
const labels=cards.map(card=>card.querySelector('h2').textContent);
cards.forEach(card=>card.draggable=false);
function measure(){
  const style=getComputedStyle(stage);
  // Resolve viewport-relative values without relying on CSS string parsing.
  const mobile=matchMedia('(max-width:600px)').matches;
  radius=mobile?innerWidth*.45:(innerWidth<=1100?260:320);
  rise=parseFloat(style.getPropertyValue('--orbit-rise'))||36;
  stride=Math.max(120,Math.min(stage.clientWidth*.48,300));
  render();
}
function render(){
  const settled=Math.abs(position-target)<.001 && !gesture?.horizontal;
  cards.forEach((card,i)=>{
    const angle=(i-position)*step,depth=(Math.cos(angle)+1)/2;
    const x=Math.sin(angle)*radius,y=-(1-depth)*rise,scale=.60+.40*depth;
    card.style.transform=`translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) scale(${scale.toFixed(4)})`;
    card.style.zIndex=String(Math.round(depth*100)+1);
    card.style.opacity=String(.30+.70*depth);
    card.style.filter=`blur(${((1-depth)*1.5).toFixed(2)}px)`;
    const front=settled && i===mod(Math.round(target));
    card.dataset.front=String(front);
    card.setAttribute('aria-label',`${front?'Conhecer':'Trazer ao centro'} ${labels[i]}`);
  });
}
function report(){
  const i=mod(Math.round(target));
  count.textContent=`${String(i+1).padStart(2,'0')} — ${String(total).padStart(2,'0')}`;
  status.textContent=`${labels[i]}, produto ${i+1} de ${total}.`;
  const title=document.querySelector('#featured-name');
  if(title){
    title.textContent=labels[i];
    document.querySelector('#featured-number').textContent=String(i+1).padStart(2,'0');
    document.querySelector('#featured-subtitle').textContent=cards[i].querySelector('.product-caption p').textContent;
    document.querySelector('#featured-product').setAttribute('href',cards[i].getAttribute('href'));
  }
}
function stop(){cancelAnimationFrame(frame);frame=0;}
function settle(next){
  stop(); target=next;
  if(reduced.matches){position=target;render();report();return;}
  const from=position,start=performance.now(),duration=520;
  function tick(now){
    const progress=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-progress,3);
    position=from+(target-from)*ease;render();
    if(progress<1)frame=requestAnimationFrame(tick);
    else{frame=0;position=target;render();report();}
  }
  frame=requestAnimationFrame(tick);
}
function move(direction){if(!gesture)settle(target+direction);}
document.querySelector('.gallery-prev').addEventListener('click',()=>move(-1));
document.querySelector('.gallery-next').addEventListener('click',()=>move(1));
stage.addEventListener('dragstart',e=>e.preventDefault());
stage.addEventListener('pointerdown',e=>{
  if(!e.isPrimary || (e.pointerType==='mouse' && e.button!==0) || gesture)return;
  suppressUntil=0;
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,base:position,anchor:target,horizontal:false,vertical:false,moved:false};
});
stage.addEventListener('pointermove',e=>{
  if(!gesture || e.pointerId!==gesture.id)return;
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(Math.hypot(dx,dy)>8)gesture.moved=true;
  if(!gesture.horizontal && !gesture.vertical && Math.max(Math.abs(dx),Math.abs(dy))>8){
    if(Math.abs(dx)>Math.abs(dy)*1.2){
      gesture.horizontal=true;stop();gesture.base=position;
      stage.setPointerCapture(e.pointerId);stage.classList.add('is-dragging');
    }else if(Math.abs(dy)>Math.abs(dx)){gesture.vertical=true;}
  }
  if(gesture.horizontal){e.preventDefault();position=gesture.base-dx/stride;render();}
});
function finish(e,cancelled=false){
  if(!gesture || e.pointerId!==gesture.id)return;
  const g=gesture,dx=e.clientX-g.x;
  gesture=null;stage.classList.remove('is-dragging');
  if(g.moved)suppressUntil=performance.now()+650;
  if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
  if(g.horizontal){
    const threshold=Math.min(40,stride*.18);
    const next=cancelled?g.anchor:(Math.abs(dx)>=threshold?Math.round(g.anchor)+(dx<0?1:-1):g.anchor);
    settle(next);
  }
}
stage.addEventListener('pointerup',e=>finish(e));
stage.addEventListener('pointercancel',e=>finish(e,true));
// Touch starts with implicit capture on the link. Transferring it to the stage
// emits lostpointercapture on that link; that bubbling event is not a cancel.
stage.addEventListener('lostpointercapture',e=>{
  if(gesture && e.target===stage && !stage.hasPointerCapture(e.pointerId))finish(e,true);
});
stage.addEventListener('click',e=>{
  const card=e.target.closest('.product');
  if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();return;}
  if(!card)return;
  const i=cards.indexOf(card),active=mod(Math.round(target));
  if(i!==active || frame){
    e.preventDefault();
    let distance=mod(i-active);if(distance>total/2)distance-=total;
    settle(Math.round(target)+distance);
  }
},true);
region.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}
});
// Wheel/trackpad navigate the showroom; native touch retains pan-y.
let wheelTotal=0,wheelAt=-Infinity,wheelMovedAt=-Infinity;
region.addEventListener('wheel',e=>{
  if(e.ctrlKey||gesture)return;
  const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?16:e.deltaMode===2?stage.clientWidth:1);
  if(!delta)return;
  const now=performance.now();e.preventDefault();
  if(now-wheelAt>180)wheelTotal=0;
  wheelAt=now;if(now-wheelMovedAt<650)return;
  wheelTotal+=delta;
  if(Math.abs(wheelTotal)>=35){move(wheelTotal>0?1:-1);wheelTotal=0;wheelMovedAt=now;}
},{passive:false});
// Keep the correct item centered when opening a deep link or returning from its card.
function fromRoute(){const key=location.hash.replace('#produto/',''),i=cards.findIndex(c=>c.dataset.product===key);if(i>=0){stop();position=target=i;render();report();}}
addEventListener('hashchange',fromRoute);
addEventListener('resize',measure);
reduced.addEventListener('change',()=>{if(reduced.matches){stop();position=target;render();report();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();gesture=null;stage.classList.remove('is-dragging');position=target;render();report();}});
measure();fromRoute();report();
