-- Entrar com o Google e com a Apple (api/_lib/social.js e accounts.js socialSignIn). Cada conta do provedor (o "sub" do
-- token, que não muda) aponta para um cliente; um cliente pode ter as duas. O e-mail guardado é o que o provedor informou
-- no último acesso (na Apple pode ser o endereço privado @privaterelay.appleid.com). Vai embora junto com a conta.
-- A foto do perfil do Google fica em customers.avatar_url (só endereços lh3.googleusercontent.com).

CREATE TABLE customer_identities (
  provider VARCHAR(16) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  email VARCHAR(180) NULL,
  private_email TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (provider, subject),
  KEY ix_identities_customer (customer_id),
  CONSTRAINT fk_identities_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE customers ADD COLUMN avatar_url VARCHAR(500) NULL;
