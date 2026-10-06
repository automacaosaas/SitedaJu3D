import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../dist/journey.js', import.meta.url), 'utf8');
function setup(saved, width = 1200, denied = false, dataset = {}) {
  const css = new Map(), classes = new Set(), events = {}, timers = [];
  const root = {dataset,style:{setProperty:(k,v)=>css.set(k,v)},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
  const storage = {getItem:()=>{if(denied)throw Error();return saved;},setItem:(key,value)=>{if(denied)throw Error();saved=value;}};
  const context = {URL, URLSearchParams, document:{documentElement:root,addEventListener:(name,fn)=>events[name]=fn,images:[],fonts:{ready:Promise.resolve()}},location:{href:'https://ju.test/index.html',origin:'https://ju.test',pathname:'/index.html',search:''},sessionStorage:storage,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:width>=901}),innerHeight:900,Promise};
  context.window = context; context.parent = context; context.addEventListener=(name,fn)=>events[name]=fn;
  vm.runInNewContext(source,context);
  return {context,css,classes,events,timers};
}
let state = setup('{invalid');
assert.equal(state.css.get('--theme-accent'),'#25664c');
state = setup(JSON.stringify({colors:{'--theme-accent':'url(https://evil.test)','--theme-text':'#123456'}}));
assert.equal(state.css.get('--theme-accent'),'#25664c');
assert.equal(state.css.get('--theme-text'),'#123456');
state = setup(null,1200,true);
assert.doesNotThrow(()=>state.context.juTheme.save('aviaoscopia',{'--theme-accent':'#22638f'}));
assert.equal(state.css.get('--theme-accent'),'#22638f');
state.timers[0]();
assert(!state.classes.has('journey-pending'),'resource failures cannot leave content hidden');
assert(state.classes.has('journey-ready'));
for(const width of [390,1366]) {
  const test=setup(null,width);let opened=false,prevented=false;
  test.context.openJuAccount=()=>opened=true;
  const link={href:'https://ju.test/conta.html',target:'',download:false};
  test.events.click({target:{closest:()=>link},button:0,preventDefault(){prevented=true;}});
  assert.equal(opened,width===1366);
  assert.equal(prevented,width===1366,'mobile keeps native navigation');
  opened=false;test.events.click({target:{closest:()=>link},button:0,ctrlKey:true,preventDefault(){assert.fail();}});
  assert(!opened,'modified clicks retain new-tab behavior');
}
// A product page (tools/build-product-pages.cjs) wears its own piece from the first frame and saves it for the home's showcase.
const own = {'--theme-text':'#0e1c3d','--theme-muted':'#3a6280','--theme-accent':'#22638f','--theme-wash':'#e0f1fa','--theme-soft':'#cedde6','--theme-accent-strong':'#1b4f72'};
state = setup(JSON.stringify({product:'borboletoscopio',colors:{'--theme-accent':'#25664c'}}),1200,false,{themeProduct:'aviaoscopia',themeColors:JSON.stringify(own)});
assert.equal(state.css.get('--theme-accent'),'#22638f','a product page wears its own piece, not the last one seen');
assert.equal(state.context.juTheme.product(),'aviaoscopia','and the home opens its showcase on it');
state.context.juTheme.save('borboletoscopio',{'--theme-accent':'#25664c'});
state.events.pageshow({persisted:true});
assert.equal(state.context.juTheme.product(),'aviaoscopia','Back to the product page claims its piece again');
assert.equal(state.css.get('--theme-accent'),'#22638f');
state = setup(null,1200,false,{themeProduct:'aviaoscopia',themeColors:'{broken'});
assert.equal(state.css.get('--theme-accent'),'#25664c','broken page data keeps the defaults');
state = setup(null,1200,true,{themeProduct:'aviaoscopia',themeColors:JSON.stringify(own)});
assert.equal(state.css.get('--theme-accent'),'#22638f','blocked storage still shows the piece');
console.log('PASS: theme validation and storage failure, product pages claim their piece (also after Back), loading fail-open, desktop drawer/mobile navigation and modified clicks.');
