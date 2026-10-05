-- O Bling sem parar a loja (05/10/2026): a fila das notas fiscais, o disjuntor da integração e o registro das falhas.
--
-- integration_log: falhas, pausas, alertas e recuperações da integração (as chamadas que dão certo não ficam aqui),
--   guardados por 90 dias.
-- integrations: o disjuntor. Depois de algumas falhas seguidas, o site para de chamar o Bling por um tempo (open_until)
--   e só testa de novo quando esse tempo passa; alerted_at marca que a Ju já foi avisada por e-mail.
-- invoices: a própria nota é a tarefa da fila. Situação nova "fila": esperando para ir ao Bling (o Bling fora do ar,
--   instável, pedindo uma pausa, desconectado ou com a emissão pausada); sai sozinha quando ele voltar.
--   next_attempt_at: quando o site tenta enviar (fila), confere (processando) ou reenvia o e-mail da nota (autorizada).
--   retries: tentativas automáticas desde a última mudança de situação (dita o intervalo entre elas).
--   locked_until: reserva a nota para uma tentativa por vez (o painel e a fila nunca enviam a mesma nota juntos).
--
-- A tabela nova vem primeiro e com IF NOT EXISTS: se um passo seguinte falhar, a migração pode rodar de novo.

CREATE TABLE IF NOT EXISTS integration_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  operation VARCHAR(80) NULL,
  http_status SMALLINT UNSIGNED NULL,
  duration_ms INT UNSIGNED NULL,
  reference VARCHAR(40) NULL,
  message VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_integration_log_name (name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE integrations
  ADD COLUMN failures SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN failing_since DATETIME(3) NULL,
  ADD COLUMN open_until DATETIME(3) NULL,
  ADD COLUMN last_error VARCHAR(300) NULL,
  ADD COLUMN alerted_at DATETIME(3) NULL;

ALTER TABLE invoices
  ADD COLUMN next_attempt_at DATETIME(3) NULL,
  ADD COLUMN retries SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME(3) NULL,
  ADD KEY ix_invoices_next_attempt (next_attempt_at);

-- Notas que já estavam em processamento: a fila confere de novo logo na primeira volta.
UPDATE invoices SET next_attempt_at = UTC_TIMESTAMP(3) WHERE status = 'processando';
