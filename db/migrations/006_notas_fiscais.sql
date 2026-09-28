-- Notas fiscais (NF-e) dos pedidos: uma por pedido, emitida por um serviço com API quando a Ju confirma o pedido no
-- painel. Guarda a situação (processando, autorizada, erro), o número, a chave de acesso e os links do PDF (DANFE) e do
-- XML devolvidos pelo emissor. O CPF do comprador não fica aqui: vai do pedido direto para o emissor.

CREATE TABLE invoices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  environment VARCHAR(12) NOT NULL,
  reference VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL,
  number VARCHAR(12) NULL,
  series VARCHAR(4) NULL,
  access_key CHAR(44) NULL,
  pdf_url VARCHAR(600) NULL,
  xml_url VARCHAR(600) NULL,
  message VARCHAR(600) NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  authorized_at DATETIME(3) NULL,
  customer_notified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoices_order (order_id),
  KEY ix_invoices_status (status),
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
