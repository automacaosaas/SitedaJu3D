-- Rastreio: o último evento dos Correios numa coluna própria (05/10/2026, RASTREIO.md). A lista do painel lê só ele,
-- em vez dos até 40 eventos de tracking_events, que ficam para a linha do tempo de "Meus pedidos".
--
-- tracking_last: o evento mais recente (JSON), gravado junto com tracking_events a cada consulta.
ALTER TABLE orders
  ADD COLUMN tracking_last TEXT NULL;
