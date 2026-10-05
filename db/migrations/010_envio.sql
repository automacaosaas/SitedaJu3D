-- Envio do pedido (Painel da Ju). O caminho de um pedido pago passa a ser: pendente → confirmado (a Ju confirmou; a nota
-- fiscal sai aqui e o pedido fica "pronto para envio") → enviado (postado nos Correios, com o código de rastreio) →
-- concluido (o cliente recebe o e-mail com o rastreio) | recusado. tracking_code guarda o código dos Correios
-- (AA123456789BR) e shipped_at o dia em que ele entrou no painel. Os pedidos que já estavam "concluido" eram os confirmados
-- com nota emitida, sem rastreio: passam para "confirmado".

ALTER TABLE orders
  ADD COLUMN tracking_code VARCHAR(20) NULL,
  ADD COLUMN shipped_at DATETIME(3) NULL;

UPDATE orders SET status = 'confirmado' WHERE status = 'concluido';
