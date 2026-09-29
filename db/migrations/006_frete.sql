-- Frete de verdade: o pedido guarda o envio escolhido (serviço dos Correios, prazo, o que foi cobrado do cliente e o custo da
-- etiqueta para a Ju). Texto JSON, como os outros campos estruturados; NULL nos pedidos feitos com o frete fixo de exemplo.

ALTER TABLE orders
  ADD COLUMN shipping_info TEXT NULL AFTER ship_to;
