# Fontes ampliadas (Real-ESRGAN)

As fotos da galeria saem das fontes de `design/vistas/`, mas o gerador (`gerar.cjs`) usa a versão **ampliada 4x** de cada uma,
quando existe (`_ampliadas` em `fotos.json`). As fotos do Luiz vieram pelo WhatsApp, pequenas e comprimidas; ampliadas pelo
Real-ESRGAN, ganham superfícies lisas, olhos e beiradas nítidos, sem o chuvisco — o "zoom óptico" pedido em 07/10/2026. As
medidas de `fotos.json` (recortes, chão, áreas) continuam em pixels da **original**: o gerador multiplica pelo fator.

## Refazer (foto nova ou trocada)

1. O Real-ESRGAN (código aberto, BSD-3) roda no PC, sem internet. Versão usada: `realesrgan-ncnn-vulkan-20220424-windows.zip`,
   do GitHub oficial (github.com/xinntao/Real-ESRGAN, release v0.2.5.0), descompactada em `C:\Users\LUIZ\tools\realesrgan`.
2. Ampliar (modelo `realesrgan-x4plus`; `-t 128` divide em blocos e evita a saída vazia nas imagens grandes):

   ```
   realesrgan-ncnn-vulkan.exe -i design/vistas/<fonte> -o <saida>.png -n realesrgan-x4plus -s 4 -t 128 -f png
   ```

3. Converter o PNG para WebP (qualidade 0,92; mantém a transparência quando houver) e salvar em `design/vistas/ampliadas/`
   com o nome `<fonte sem extensão>-x4.webp`.
4. Registrar em `fotos.json`, `_ampliadas`: `"<fonte>": {"arquivo": "ampliadas/<nome>-x4.webp", "fator": 4, "encolher": 0.5}`
   (`encolher` tira o fio escuro do fundo preto na beirada; nas fotos de fundo claro, sem ele).
5. `node tools/galeria-vistas/gerar.cjs <peça>`, subir `VIEWS_VERSION` em `dist/gallery.js` e `node tools/build-product-pages.cjs`.

Confira sempre o resultado de perto: o modelo não inventa peças, mas pode alisar detalhes muito pequenos (os números da régua
do avião continuam, em relevo discreto).

## Cores

As cores de cada peça (`cores` em `fotos.json`) foram calibradas pela **média** de cada parte: "de" é a cor média da parte na
foto de frente original, "para" é a cor média da mesma parte na foto da vitrine (medidas em OKLab). Assim a peça sai, em média,
com a claridade, a saturação e o matiz da vitrine. Trocou a foto ou a vitrine: meça de novo e atualize os dois valores.
