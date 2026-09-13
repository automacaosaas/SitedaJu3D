const products = {
  'capa-01': {number:'01',title:'Capa para retinoscópio',subtitle:'Modelo 01',image:'pillar-amber.png',description:'A primeira das duas capas para retinoscópio da Ju imprime pra mim.'},
  'capa-02': {number:'02',title:'Capa para retinoscópio',subtitle:'Modelo 02',image:'pillar-cyan.png',description:'A segunda das duas capas para retinoscópio da Ju imprime pra mim.'},
  'aviao-magnetico': {number:'03',title:'Avião magnético',subtitle:'Para régua de grau',image:'pillar-blue.png',description:'Um avião magnético que se encaixa na régua de grau.'}
};
const dialog = document.querySelector('#product-dialog');
let activeProduct = null;
function syncProduct() {
  const key = location.hash.replace('#produto/', '');
  const product = products[key];
  if (!product) { if (dialog.open) dialog.close(); document.title = 'Ju imprime pra mim • Coleção 3D'; return; }
  activeProduct = key;
  document.querySelector('#dialog-number').textContent = `COLEÇÃO 01 / PEÇA ${product.number}`;
  document.querySelector('#dialog-title').textContent = product.title;
  document.querySelector('#dialog-subtitle').textContent = product.subtitle;
  document.querySelector('#dialog-description').textContent = product.description;
  document.querySelector('#dialog-image').src = `assets/${product.image}`;
  document.title = `${product.title} · ${product.subtitle} | Ju imprime pra mim`;
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
}
function closeProduct() {
  history.replaceState(null,'',location.pathname + location.search);
  if (dialog.open) dialog.close();
  document.title = 'Ju imprime pra mim • Coleção 3D';
}
document.querySelector('.close').addEventListener('click',closeProduct);
document.querySelector('.back').addEventListener('click',closeProduct);
dialog.addEventListener('cancel',event=>{event.preventDefault();closeProduct();});
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeProduct();}});
dialog.addEventListener('close',()=>{document.body.style.overflow='';document.querySelector(`[data-product="${activeProduct}"]`)?.focus({preventScroll:true});});
window.addEventListener('hashchange',syncProduct);
syncProduct();
