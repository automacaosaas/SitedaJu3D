import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../dist/loading-ui.js',import.meta.url),'utf8');
// The tab's visibility, as in a browser: a background tab draws nothing, so decode() waits for it to come back.
globalThis.document = Object.assign(new EventTarget(),{hidden:false});
// Listeners still attached to a target, by type (nothing in loading-ui.js may be left listening once it has answered).
function track(target) {
  const live = new Map(), {addEventListener: add, removeEventListener: remove} = target;
  target.addEventListener = (type, fn, options) => { live.set(fn, type); add.call(target, type, fn, options); };
  target.removeEventListener = (type, fn, options) => { live.delete(fn); remove.call(target, type, fn, options); };
  target.listening = type => [...live.values()].filter(t => t === type).length;
  return target;
}
track(document);
const {imageReady, waitImage, revealImage} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fakeImage({complete=false,width=0,decode=()=>Promise.resolve()}={}) {
  const img = new EventTarget(); Object.assign(img,{complete,naturalWidth:width,decode}); return img;
}
const settle = () => new Promise(resolve => setTimeout(resolve));
assert.equal(await imageReady(fakeImage({complete:true,width:400})),true);
assert.equal(await imageReady(fakeImage({complete:true})),false);
const image=fakeImage(); const ready=imageReady(image); image.naturalWidth=400; image.dispatchEvent(new Event('load')); assert.equal(await ready,true);
const broken=fakeImage(); const failure=imageReady(broken); broken.dispatchEvent(new Event('error')); assert.equal(await failure,false);
assert.equal(await imageReady(fakeImage(),5),false,'a stalled resource never blocks the page indefinitely');
assert.equal(await imageReady(fakeImage({complete:true,width:400,decode:()=>Promise.reject(Error('decode'))})),true,'loaded fallback remains available');
const stalled=()=>new Promise(()=>{});
document.hidden=true;
assert.equal(await imageReady(fakeImage({complete:true,width:400,decode:stalled}),50),true,'a page opened in a background tab does not wait for decode()');
assert.equal(await imageReady(fakeImage({complete:true,decode:stalled}),50),false,'but a broken image is still broken');
document.hidden=false;
const leaving=imageReady(fakeImage({complete:true,width:400,decode:stalled}),50);
document.hidden=true; document.dispatchEvent(new Event('visibilitychange'));
assert.equal(await leaving,true,'switching to another tab mid-decode keeps the loaded image');
document.hidden=false;
// Late is not broken (waitImage): a photo still on its way at the limit is 'slow', even with its size already known; for
// imageReady it is still a no.
assert.equal(await waitImage(fakeImage(),5),'slow');
assert.equal(await waitImage(fakeImage({width:400}),5),'slow','dimensions known, download not finished: still on its way');
assert.equal(await imageReady(fakeImage(),5),false);
assert.equal(await waitImage(fakeImage({complete:true,width:400})),'loaded');
{ const img=fakeImage(); const state=waitImage(img); img.dispatchEvent(new Event('error')); assert.equal(await state,'error'); }
// Arrived just before the limit and still decoding: ready, not unavailable (it was hidden for good)
assert.equal(await waitImage(fakeImage({complete:true,width:400,decode:stalled}),20),'loaded');
{ const img=fakeImage({decode:stalled}); const state=waitImage(img,20); Object.assign(img,{complete:true,naturalWidth:400}); img.dispatchEvent(new Event('load')); assert.equal(await state,'loaded'); }
// revealImage: late → shown when it arrives, once; one call per image, with a single listener left on
{
  const img=track(fakeImage()); let ready=0, failed=0;
  const options={limit:5,onReady:()=>ready++,onFail:()=>failed++};
  const first=revealImage(img,options), second=revealImage(img,options);
  assert.equal(first,second,'a second call answers the same');
  assert.equal(await first,'slow');
  assert.deepEqual([ready,failed],[0,0],'late is never reported as unavailable');
  assert.equal(img.listening('load'),1,'one listener left on, not one per call'); assert.equal(img.listening('error'),1);
  Object.assign(img,{complete:true,naturalWidth:400}); img.dispatchEvent(new Event('load')); await settle();
  assert.deepEqual([ready,failed],[1,0],'the late photo shows up when it arrives, once');
  img.dispatchEvent(new Event('load')); await settle();
  assert.equal(ready,2,'loaded again (another srcset file after turning the phone): shown again, so onReady must be idempotent');
  assert.equal(img.listening('load'),1,'still a single listener');
}
{
  const img=fakeImage(); let ready=0, failed=0;
  const state=revealImage(img,{limit:50,onReady:()=>ready++,onFail:()=>failed++});
  img.complete=true; img.dispatchEvent(new Event('error'));
  assert.equal(await state,'error'); assert.deepEqual([ready,failed],[0,1],'a real failure says so');
}
{
  const img=fakeImage(); let ready=0, failed=0;
  assert.equal(await revealImage(img,{limit:5,onReady:()=>ready++,onFail:()=>failed++}),'slow');
  img.complete=true; img.dispatchEvent(new Event('error')); await settle();
  assert.deepEqual([ready,failed],[0,1],'late, then failed: only now unavailable');
}
{
  let ready=0, failed=0;
  assert.equal(await revealImage(fakeImage({complete:true,width:400}),{onReady:()=>ready++,onFail:()=>failed++}),'loaded');
  assert.deepEqual([ready,failed],[1,0],'a cached photo shows at once');
}
assert.equal(document.listening('visibilitychange'),0,'no visibilitychange listener left behind, whatever the answer');
const nav=await readFile(new URL('../dist/shopping-navigation.js',import.meta.url),'utf8');
const {localDestination}=await import('data:text/javascript;base64,'+Buffer.from(nav).toString('base64'));
const base='https://example.com/checkout.html';
assert.equal(localDestination('https://external.test/index.html',base),null);
assert.equal(localDestination('javascript:alert(1)',base),null);
assert.equal(localDestination('/checkout.html',base),null);
assert.equal(localDestination('/index.html#produtos',base),'/index.html#produtos');
assert.equal(localDestination('/produtos.html',base),'/produtos.html');
assert.equal(localDestination('/',base),'/');
console.log('PASS: cached/decoded/failed/stalled/late images (also in a background tab), with no listener left behind, and safe same-site cart destinations.');
