-- Rastreio automático pelos Correios (05/10/2026, API Rastro, RASTREIO.md): o site consulta os pacotes enviados de
-- tempos em tempos e guarda o que os Correios dizem, para o painel, "Meus pedidos" e os avisos.
--
-- tracking_state: em que pé o pacote está (postado, em_transito, saiu_para_entrega, aguardando_retirada, entregue,
--   problema, devolvido, nao_encontrado).
-- tracking_events: os eventos dos Correios, do mais recente para o mais antigo (JSON, até 40).
-- tracking_checked_at: a última consulta (a próxima vem depois de algumas horas).
-- delivered_at: quando os Correios registraram a entrega (o pedido vai sozinho para Concluídos).
-- tracking_notices: os avisos que já saíram para este pacote, para nenhum sair duas vezes.
ALTER TABLE orders
  ADD COLUMN tracking_state VARCHAR(24) NULL,
  ADD COLUMN tracking_events MEDIUMTEXT NULL,
  ADD COLUMN tracking_checked_at DATETIME(3) NULL,
  ADD COLUMN delivered_at DATETIME(3) NULL,
  ADD COLUMN tracking_notices VARCHAR(255) NULL,
  ADD INDEX orders_tracking (status, tracking_checked_at);
