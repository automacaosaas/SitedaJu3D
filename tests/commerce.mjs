import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const files=['products.js','commerce-config.js','cart-store.js','demo-payment.js'];
const modules={};
for(const file of files){let source=await readFile(new URL('../dist/'+file,import.meta.url),'utf8');for(const [name,url] of Object.entries(modules))source=source.replaceAll(`'./${name}'`,JSON.stringify(url));modules[file]='data:text/javascript;base64,'+Buffer.from(source).toString('base64');}
const {readCart,writeCart,putItem,putItems,normalizeCart,totals,pixDiscount,priceSegments,lineCents}=await import(modules['cart-store.js']);
// "Monte seu kit" (07/10/2026): várias peças numa escrita só; a mesma peça soma na linha que já existe, e o kit sai pelo preço do grupo
{const kit=putItems([],[{productId:'macacoscopio',quantity:1},{productId:'girafoscopio',quantity:1},{productId:'unicornioscopio',quantity:1}]);
 assert.equal(kit.length,3);assert.equal(totals(kit,0).subtotal,21000,'three lamps: R$ 210');assert.equal(totals(kit,0).subtotal-pixDiscount(kit),19950,'and R$ 199,50 with Pix');
 const before=putItem([],'girafoscopio',{}),merged=putItems(before,[{productId:'girafoscopio',quantity:2},{productId:'unicornioscopio',quantity:1}]);
 assert.equal(merged.length,2);assert.equal(merged[0].id,before[0].id,'the giraffe already in the cart keeps its line');assert.equal(merged[0].quantity,3);
 assert.equal(totals(merged,0).subtotal,21000+9000,'4 lamps: one group of 3 and one at full price');
 assert.deepEqual(putItems([],[{productId:'aviaoscopia',quantity:1,selection:{body:'nope'}},{productId:'__proto__',quantity:1},{productId:'missing',quantity:2},{productId:'macacoscopio',quantity:0}]).map(i=>[i.productId,i.quantity,i.selection.body]),[['aviaoscopia',1,'blue']],'only real pieces, with valid colors and at least one unit');
 assert.equal(putItems([],[{productId:'macacoscopio',quantity:250}])[0].quantity,99,'capped like any line');
 assert.throws(()=>putItems(kit,[]),/Escolha pelo menos uma peça/);assert.throws(()=>putItems(kit,[{productId:'macacoscopio',quantity:0}]),/Escolha pelo menos uma peça/);}
const {createDemoOrder,approveDemo,renewDemo,paymentStatus,demoPixCode}=await import(modules['demo-payment.js']);
const {COMMERCE}=await import(modules['commerce-config.js']);
let encoded=null;const storage={getItem:()=>encoded,setItem:(key,value)=>{encoded=value;}};
let cart=putItem([],'borboletoscopio',{body:'pink',details:'blue'});
cart[0].quantity=2;const firstId=cart[0].id;
writeCart(cart,storage);assert.deepEqual(readCart(storage),cart,'reload retains selection and quantity');
cart=putItem(cart,'borboletoscopio',{body:'pink',details:'blue'});
assert.equal(cart.length,1);assert.equal(cart[0].quantity,3,'same selection merges intentionally');
cart=putItem(cart,'borboletoscopio',{body:'mint',details:'yellow'});
assert.equal(cart.length,2,'different selections remain distinct');
cart=putItem(cart,'borboletoscopio',{body:'mint',details:'yellow'},null,firstId);
assert.equal(cart.length,1);assert.equal(cart[0].quantity,4,'editing into another configuration merges without losing quantity');
assert.throws(()=>putItem(cart,'borboletoscopio',{},null,'removed-id'));
for(const productId of ['dinossauroscopio','aviaoscopia'])cart=putItem(cart,productId,{body:'lilac',details:'pink',engines:'white'});
assert.equal(cart.at(-1).selection.engines,'white');
assert.equal(totals(cart).total,4*26500+26500+28500+1800);
// O 2.º avião (e os seguintes) na mesma compra sai por R$ 215, em qualquer linha do carrinho: a primeira unidade, na ordem do carrinho,
// tem o preço cheio. O servidor divide igual (api/_lib/catalog.js), então a página mostra o que o Mercado Pago cobra.
{const two=normalizeCart([{productId:'aviaoscopia',quantity:1,selection:{body:'blue'}},{productId:'borboletoscopio',quantity:1},{productId:'aviaoscopia',quantity:2,selection:{body:'red'}}]);
 assert.deepEqual(priceSegments(two).map(s=>[s.item.productId,s.quantity,s.unitCents]),[['aviaoscopia',1,28500],['borboletoscopio',1,26500],['aviaoscopia',2,21500]]);
 assert.deepEqual(totals(two,1800),{subtotal:28500+26500+2*21500,shipping:1800,total:28500+26500+2*21500+1800});
 assert.equal(pixDiscount(two),1425+1325+2*1075,'Pix: 5% of what each unit really costs');
 assert.deepEqual(two.map(i=>lineCents(two,i)),[28500,26500,43000]);
 const one=normalizeCart([{productId:'aviaoscopia',quantity:3}]);
 assert.deepEqual(priceSegments(one).map(s=>[s.quantity,s.unitCents]),[[1,28500],[2,21500]],'one line with three airplanes: the first at full price');
 assert.equal(totals(one,0).total,28500+2*21500);
 assert.equal(totals(normalizeCart([{productId:'dinossauroscopio',quantity:2}]),0).total,2*26500,'the other pieces have no quantity price');}
assert.deepEqual(totals([]),{subtotal:0,shipping:0,total:0});
const corrupt=normalizeCart([{productId:'__proto__'},{productId:'missing'},null,{productId:'aviaoscopia',quantity:-3,selection:{body:'invalid'},unitPrice:1,thumbnail:'https://untrusted.invalid/a.png'}]);
assert.equal(corrupt.length,1);assert.equal(corrupt[0].quantity,1);assert.equal(corrupt[0].unitPrice,28500);assert.equal(corrupt[0].selection.body,'blue');assert.equal(corrupt[0].thumbnail,null);
encoded='broken';assert.deepEqual(readCart(storage),[]);
assert.throws(()=>writeCart(cart,{setItem(){throw Error('QuotaExceeded');}}),/salvar/);
assert.throws(()=>createDemoOrder([],'pix'));assert.throws(()=>createDemoOrder(cart,'invalid'));
const now=100000, order=createDemoOrder(cart,'pix',now),originalQuantity=order.items[0].quantity;
cart[0].quantity=1;assert.equal(order.items[0].quantity,originalQuantity,'order is an immutable snapshot of cart');
assert.equal(paymentStatus(order,now),'pending');
assert.equal(paymentStatus(order,now+COMMERCE.pixDurationMs),'expired');
assert.throws(()=>approveDemo(order,now+COMMERCE.pixDurationMs));
const renewed=renewDemo(order,now+COMMERCE.pixDurationMs+1);
assert.notEqual(demoPixCode(order),demoPixCode(renewed));assert.equal(renewed.id,order.id);assert.equal(renewed.attempt,2);
assert.equal(paymentStatus(renewed,renewed.expiresAt-1),'pending');
const paid=approveDemo(renewed,renewed.expiresAt-1);assert.equal(paymentStatus(paid,renewed.expiresAt+10000),'approved');assert.throws(()=>approveDemo(paid));assert.throws(()=>renewDemo(paid));
assert.throws(()=>approveDemo({...order,mode:'live'},now),'demo adapter refuses live approval');
const card=createDemoOrder(cart,'card',now);assert.equal(paymentStatus(card,now+COMMERCE.pixDurationMs),'pending');assert.equal(approveDemo(card).status,'approved');
console.log('PASS: cart persistence, all product color maps, merge/edit/quantity/totals, hostile storage, storage failure, order snapshot, Pix expiration/renewal/approval, card approval and live-mode refusal.');
