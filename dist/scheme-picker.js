// Aparência: o tema do aparelho (Automático), claro ou escuro. Quem guarda e pinta a escolha é journey.js (window.juScheme),
// que roda antes da página aparecer, para não piscar; aqui ficam só os três botões, em "Seu cantinho" (conta.html) e no menu
// do perfil do topo das páginas. Rádios nativos dentro de um fieldset: as setas trocam a opção e o leitor de tela diz o grupo.
// O "polegar" que desliza até a opção escolhida é só desenho (journey.css).
import {icon} from './icons.js';

const OPTIONS = [['auto', 'contrast', 'Automático', 'Auto'], ['light', 'sun', 'Claro', 'Claro'], ['dark', 'moon', 'Escuro', 'Escuro']];
let count = 0;
const current = () => window.juScheme?.mode() || 'auto';

// compact: o menu do perfil, estreito (rótulos curtos, ícone sobre o texto); hint: uma linha de ajuda embaixo das opções.
export function schemePicker({compact = false, hint = ''} = {}) {
  const name = `ju-scheme-${++count}`, mode = current();
  return `<fieldset class="scheme-picker${compact ? ' is-compact' : ''}"><legend>Aparência</legend><div class="scheme-options">`
    + OPTIONS.map(([value, glyph, label, short]) => `<label class="scheme-option"><input type="radio" name="${name}" value="${value}"${value === mode ? ' checked' : ''}><span>${icon(glyph)}<span>${compact ? short : label}</span></span></label>`).join('')
    + `<i class="scheme-thumb" aria-hidden="true"></i></div>${hint ? `<p class="scheme-hint">${hint}</p>` : ''}</fieldset>`;
}

// Liga os pickers de dentro de root (uma vez por root): escolher grava e repinta; a escolha feita noutra aba, ou o aparelho
// trocando de tema no Automático, volta marcada aqui.
export function wireSchemePicker(root) {
  if (!root || root.dataset.schemeWired) return;
  root.dataset.schemeWired = '1';
  root.addEventListener('change', event => { if (event.target.matches?.('.scheme-picker input')) window.juScheme?.set(event.target.value); });
  window.addEventListener('ju:scheme', () => { const mode = current(); root.querySelectorAll('.scheme-picker input').forEach(input => { input.checked = input.value === mode; }); });
}
