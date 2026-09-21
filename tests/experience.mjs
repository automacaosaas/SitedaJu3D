import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../dist/loading-ui.js',import.meta.url),'utf8');
const {imageReady} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fakeImage({complete=false,width=0,decode=()=>Promise.resolve()}={}) {
  const img = new EventTarget(); Object.assign(img,{complete,naturalWidth:width,decode}); return img;
}
assert.equal(await imageReady(fakeImage({complete:true,width:400})),true);
assert.equal(await imageReady(fakeImage({complete:true})),false);
const image=fakeImage(); const ready=imageReady(image); image.naturalWidth=400; image.dispatchEvent(new Event('load')); assert.equal(await ready,true);
const broken=fakeImage(); const failure=imageReady(broken); broken.dispatchEvent(new Event('error')); assert.equal(await failure,false);
assert.equal(await imageReady(fakeImage(),5),false,'a stalled resource never blocks the page indefinitely');
assert.equal(await imageReady(fakeImage({complete:true,width:400,decode:()=>Promise.reject(Error('decode'))})),true,'loaded fallback remains available');
const nav=await readFile(new URL('../dist/shopping-navigation.js',import.meta.url),'utf8');
const {localDestination}=await import('data:text/javascript;base64,'+Buffer.from(nav).toString('base64'));
const base='https://example.com/checkout.html';
assert.equal(localDestination('https://external.test/index.html',base),null);
assert.equal(localDestination('javascript:alert(1)',base),null);
assert.equal(localDestination('/checkout.html',base),null);
assert.equal(localDestination('/index.html#produtos',base),'/index.html#produtos');
assert.equal(localDestination('/produtos.html',base),'/produtos.html');
assert.equal(localDestination('/',base),'/');
console.log('PASS: cached/decoded/failed/stalled images and safe same-site cart destinations.');
