import {translations} from './translations.js';

export const SUPPORTED = ['pt-BR', 'en', 'es'];
const list = (t, text) => text.split(', ').map(part => t(part)).join(', ');
// Text that carries a name, a number or a list. Each rule is [pattern, English, Spanish]; a replacement is either a
// string with $1 groups or a function that receives a translator for the target language plus the captured groups.
const dynamic = [
  [/^COLEÇÃO 01 \/ PEÇA (\d+)$/, 'COLLECTION 01 / PIECE $1', 'COLECCIÓN 01 / PIEZA $1'],
  [/^(.+), produto (\d+) de (\d+)\.$/, '$1, product $2 of $3.', '$1, producto $2 de $3.'],
  [/^Conhecer (.+)$/, 'Discover $1', 'Conocer $1'],
  [/^Trazer ao centro (.+)$/, 'Bring $1 to center', 'Centrar $1'],
  [/^Olá, (.+)\.$/, 'Hello, $1.', 'Hola, $1.'],
  [/^Reenviar em (\d+)s$/, 'Resend in $1s', 'Reenviar en $1s'],
  [/^Selecionar todos \((\d+)\)$/, 'Select all ($1)', 'Seleccionar todos ($1)'],
  [/^(\d+) peça selecionada$/, '$1 selected item', '$1 pieza seleccionada'],
  [/^(\d+) peças selecionadas\.?$/, '$1 selected items', '$1 piezas seleccionadas'],
  [/^(\d+) peça$/, '$1 item', '$1 pieza'],
  [/^Copie o link: (.+)$/, 'Copy the link: $1', 'Copia el enlace: $1'],
  [/^(.+) · (.+) \| Ju, imprime pra mim\?$/, (t, name, sub) => `${t(name)} · ${t(sub)} | Ju, imprime pra mim?`, (t, name, sub) => `${t(name)} · ${t(sub)} | Ju, imprime pra mim?`],
  [/^(\d+) peças$/, '$1 items', '$1 piezas'],
  [/^(\d+) peças? no carrinho$/, (t, n) => n === '1' ? '1 item in the cart' : `${n} items in the cart`, (t, n) => n === '1' ? '1 pieza en el carrito' : `${n} piezas en el carrito`],
  [/^Cores de (.+)$/, 'Colors of $1', 'Colores de $1'],
  [/^Adicionar (.+) nas cores originais$/, 'Add $1 in the original colors', 'Añadir $1 en los colores originales'],
  [/^(.+) adicionado nas cores originais\.$/, '$1 added in the original colors.', '$1 añadido en los colores originales.'],
  [/^Carrinho, (\d+) item$/, 'Cart, $1 item', 'Carrito, $1 artículo'],
  [/^Carrinho, (\d+) itens$/, 'Cart, $1 items', 'Carrito, $1 artículos'],
  [/^Coleção de (\d+) produto$/, 'Collection of $1 product', 'Colección de $1 producto'],
  [/^Coleção de (\d+) produtos$/, 'Collection of $1 products', 'Colección de $1 productos'],
  [/^Escolha sua cor: ver (.+) na coleção e personalizar\. Cores originais: (.+)$/,
    (t, name, colors) => `Choose your color: view ${name} in the collection and customize. Original colors: ${list(t, colors)}`,
    (t, name, colors) => `Elige tu color: ver ${name} en la colección y personalizar. Colores originales: ${list(t, colors)}`],
  [/^Cores fixas: (.+)\.$/, (t, colors) => `Fixed colors: ${list(t, colors)}.`, (t, colors) => `Colores fijos: ${list(t, colors)}.`],
  // galeria de fotos da página do produto (gallery.js): os rótulos das vistas e o texto alternativo das imagens
  [/^(.+), (\d+) de (\d+)$/, (t, view, n, total) => `${t(view)}, ${n} of ${total}`, (t, view, n, total) => `${t(view)}, ${n} de ${total}`],
  [/^(.+) — (Frente|Três quartos|Costas|.+ de perto)$/, (t, name, view) => `${name} — ${t(view)}`, (t, name, view) => `${name} — ${t(view)}`],
  [/^(.+), (\d+) de (\d+)\.$/, '$1, $2 of $3.', '$1, $2 de $3.'],
  [/^Pedido (.+)$/, 'Order $1', 'Pedido $1'],
  [/^PEDIDO (.+)$/, 'ORDER $1', 'PEDIDO $1'],
  [/^Produção: (.+)$/, 'Production: $1', 'Producción: $1'],
  [/^(\d+) a (\d+) dias úteis$/, '$1 to $2 business days', '$1 a $2 días hábiles'],
  [/^(\d+) dias úteis$/, '$1 business days', '$1 días hábiles'],
  [/^Entrega em (.+)$/, (t, days) => `Delivery in ${t(days)}`, (t, days) => `Entrega en ${t(days)}`],
  [/^Prazo estimado: (.+)$/, (t, days) => `Estimated delivery: ${t(days)}`, (t, days) => `Plazo estimado: ${t(days)}`],
  [/^(\d+) peça · (.+)$/, '$1 item · $2', '$1 pieza · $2'],
  [/^(\d+) peças · (.+)$/, '$1 items · $2', '$1 piezas · $2'],
  [/^Adicionar (.+) ao carrinho$/, 'Add $1 to cart', 'Añadir $1 al carrito'],
  [/^Adicionar (.+) ao carrinho nas cores originais$/, 'Add $1 to cart in the original colors', 'Añadir $1 al carrito en los colores originales'],
  [/^Personalizar (.+)$/, 'Customize $1', 'Personalizar $1'],
  [/^Mostrar (.+)$/, 'Show $1', 'Mostrar $1'],
  [/^Selecionar (.+)$/, 'Select $1', 'Seleccionar $1'],
  [/^Remover (.+)$/, 'Remove $1', 'Eliminar $1'],
  [/^Quantidade de (.+)$/, 'Quantity of $1', 'Cantidad de $1'],
  [/^Aumentar quantidade de (.+)$/, 'Increase quantity of $1', 'Aumentar cantidad de $1'],
  [/^Diminuir quantidade de (.+)$/, 'Decrease quantity of $1', 'Reducir cantidad de $1'],
  [/^Editar personalização de (.+)$/, 'Edit customization of $1', 'Editar personalización de $1'],
  [/^Cores escolhidas para (.+)$/, 'Selected colors for $1', 'Colores elegidos para $1'],
  [/^(.+) — imagem nas cores originais$/, '$1 — original colors', '$1 — colores originales'],
  [/^(.+) nas cores originais$/, '$1 in original colors', '$1 en colores originales'],
  [/^(.+) — prévia 3D da combinação$/, '$1 — 3D combination preview', '$1 — vista previa 3D de la combinación'],
  [/^(.+) sobre uma pilastra branca — imagem de apresentação$/, '$1 on a white pedestal — presentation image', '$1 sobre un pedestal blanco — imagen de presentación'],
  [/^(.+) sobre pilastra branca$/, '$1 on a white pedestal', '$1 sobre un pedestal blanco'],
  [/^Prévia 3D ilustrativa de (.+)$/, 'Illustrative 3D preview of $1', 'Vista previa 3D ilustrativa de $1'],
  [/^Preço de (.+)$/, 'Price for $1', 'Precio de $1'],
  [/^para o frete grátis \((.+)\)\.$/, 'more for free shipping ($1).', 'para el envío gratis ($1).'],
  [/^(Pix · )?(\(?)(\d+)% de desconto nas peças(\)?)$/, '$1$2$3% off the items$4', '$1$2$3% de descuento en las piezas$4'],
  [/^\((\d+)% de desconto\)$/, '($1% off)', '($1% de descuento)'],
  [/^(\d+)% OFF NO PIX$/, '$1% OFF WITH PIX', '$1% DE DESCUENTO CON PIX'],
  [/^economize (R\$\s?[\d.,]+)$/, 'save $1', 'ahorra $1'],
  [/^(R\$\s?[\d.,]+) no Pix$/, '$1 with Pix', '$1 con Pix'],
  [/^Frete grátis \((.+)\) garantido!$/, 'Free shipping ($1) unlocked!', '¡Envío gratis ($1) garantizado!'],
  [/^Frete grátis \((.+)\) em compras a partir de (R\$ [\d.,]+)$/, 'Free shipping ($1) on orders from $2', 'Envío gratis ($1) en compras desde $2'],
  [/^(\d+)x de (R\$ [\d.,]+)$/, '$1x of $2', '$1x de $2'],
  [/^ou (\d+)x de (R\$ [\d.,]+) sem juros no cartão$/, 'or $1 interest-free card installments of $2', 'o $1 cuotas sin interés de $2 con tarjeta'],
  [/^economize (R\$ [\d.,]+)$/, 'save $1', 'ahorra $1'],
  [/^(R\$ [\d.,]+) no Pix$/, '$1 with Pix', '$1 con Pix'],
  [/^Combinação (.+) aplicada\.$/, (t, name) => `${t(name)} combination applied.`, (t, name) => `Combinación ${t(name)} aplicada.`],
  [/^Produção em (.+)$/, (t, days) => `Production in ${t(days)}`, (t, days) => `Producción en ${t(days)}`],
  [/^(\d+) de (\d+)$/, '$1 of $2', '$1 de $2'],
  [/^CET ([\d.,]+%) ao ano$/, 'Effective cost $1 a year', 'Costo efectivo $1 al año']
];
export function translate(value, locale = 'en') {
  if (locale === 'pt-BR') return value;
  const index = locale === 'es' ? 1 : 0;
  const source = value.trim().replace(/\s+/g, ' ');
  let result = translations[source]?.[index];
  if (!result && source.startsWith('Produção: ')) result = (index ? 'Producción: ' : 'Production: ') + translate(source.slice(10), locale);
  if (!result) {
    for (const [pattern, en, es] of dynamic) {
      const match = source.match(pattern);
      if (!match) continue;
      const replacement = index ? es : en;
      result = typeof replacement === 'function' ? replacement(part => translate(part, locale), ...match.slice(1)) : source.replace(pattern, replacement);
      break;
    }
  }
  // Keep punctuation, currency, product names and user data unchanged.
  if (!result && /[·•:]/.test(source)) {
    const segments = source.split(/(\s*[·•:]\s*)/);
    result = segments.map(segment => translations[segment]?.[index] || segment).join('');
  }
  if (!result) return value;
  return value.slice(0, value.length - value.trimStart().length) + result + value.slice(value.trimEnd().length);
}
