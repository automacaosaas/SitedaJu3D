-- Lista de pedidos do painel (api/admin/orders.js) e caixa: SELECT ... FROM orders WHERE status IN (...) ORDER BY
-- created_at DESC LIMIT n. Sem índice em created_at o MySQL lia e ordenava a tabela inteira a cada abertura do painel;
-- com ele, percorre os pedidos do mais novo para o mais antigo e para no limite.

ALTER TABLE orders ADD KEY ix_orders_created (created_at);
