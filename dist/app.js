const products = {
  'borboletoscopio': {number:'01',title:'Borboletoscópio',subtitle:'Capa para retinoscópio',image:'borboletoscopio.png',description:'Asas verde-menta, detalhes amarelos e um rostinho sorridente. Uma capa em formato de borboleta, feita em impressão 3D para encaixar no retinoscópio.'},
  'dinossauroscopio': {number:'02',title:'Dinossauroscópio',subtitle:'Capa para retinoscópio',image:'dinossauroscopio.png',description:'Um pequeno dinossauro azul, com espinhos e detalhes verde-menta. Uma capa feita em impressão 3D para encaixar no retinoscópio.'},
  'aviaoscopia': {number:'03',title:'Aviãoscopia',subtitle:'Avião magnético para régua de grau',image:'aviaoscopia.png',description:'Um avião azul com estrelas vermelhas e motores amarelos. A peça impressa em 3D se encaixa magneticamente na régua de grau.'}
};
const legacyProducts = {'capa-01':'borboletoscopio','capa-02':'dinossauroscopio','aviao-magnetico':'aviaoscopia'};
const dialog = document.querySelector('#product-dialog');
let activeProduct = null;
function syncProduct() {
  const hashKey = location.hash.replace('#produto/', '');
  const key = legacyProducts[hashKey] || hashKey;
  const product = products[key];
  if (!product) { if (dialog.open) dialog.close(); document.title = 'Ju imprime pra mim • Coleção 3D'; return; }
  activeProduct = key;
  document.querySelector('#dialog-number').textContent = `COLEÇÃO 01 / PEÇA ${product.number}`;
  document.querySelector('#dialog-title').textContent = product.title;
  document.querySelector('#dialog-subtitle').textContent = product.subtitle;
  document.querySelector('#dialog-description').textContent = product.description;
  document.querySelector('#dialog-image').src = `assets/${product.image}`;
  document.querySelector('#dialog-image').alt = `${product.title} sobre uma pilastra branca — imagem de apresentação`;
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
