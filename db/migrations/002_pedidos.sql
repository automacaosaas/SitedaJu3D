-- Pedidos: criados no servidor antes da cobrança e atualizados pelo Mercado Pago (webhook e consultas).
-- O pedido guarda um retrato do comprador e da entrega no momento da compra (nota fiscal e envio), então continua
-- existindo se a conta for excluída (customer_id vira NULL). Telefone e CPF do retrato ficam criptografados (DATA_KEY).
-- Campos estruturados são texto JSON (TEXT), para funcionar igual em MySQL e MariaDB.

CREATE TABLE orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  reference VARCHAR(20) NOT NULL,
  customer_id CHAR(36) NULL,
  source VARCHAR(8) NOT NULL,
  status VARCHAR(24) NOT NULL,
  payment_state VARCHAR(24) NULL,
  method VARCHAR(16) NULL,
  installments TINYINT UNSIGNED NULL,
  subtotal_cents INT UNSIGNED NOT NULL,
  shipping_cents INT UNSIGNED NOT NULL,
  total_cents INT UNSIGNED NOT NULL,
  buyer TEXT NOT NULL,
  buyer_doc_enc VARBINARY(96) NULL,
  phone_enc VARBINARY(96) NULL,
  ship_to TEXT NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  lang VARCHAR(8) NOT NULL DEFAULT 'pt-BR',
  mp_order_id VARCHAR(64) NULL,
  paid_at DATETIME(3) NULL,
  decided_at DATETIME(3) NULL,
  decline_reason VARCHAR(300) NULL,
  owner_notified_at DATETIME(3) NULL,
  customer_notified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_orders_reference (reference),
  UNIQUE KEY uq_orders_mp (mp_order_id),
  KEY ix_orders_customer (customer_id, created_at),
  KEY ix_orders_status (status, paid_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  title VARCHAR(150) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price_cents INT UNSIGNED NOT NULL,
  selection VARCHAR(500) NOT NULL,
  KEY ix_items_order (order_id, position),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  detail VARCHAR(500) NULL,
  actor VARCHAR(180) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_events_order (order_id, created_at),
  CONSTRAINT fk_events_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
