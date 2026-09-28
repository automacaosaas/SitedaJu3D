-- Painel da Ju: quem administra, as sessões do painel (separadas das de clientes) e o registro do que foi feito.
-- Senha com scrypt; segundo fator TOTP (app autenticador) com o segredo criptografado (DATA_KEY). totp_last_step guarda
-- o último código aceito, para que o mesmo código não sirva duas vezes. A primeira pessoa é criada a partir de
-- ADMIN_EMAIL e ADMIN_PASSWORD quando a tabela está vazia (api/_lib/admin-auth.js).

CREATE TABLE admin_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(180) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret_enc VARBINARY(96) NULL,
  totp_enabled_at DATETIME(3) NULL,
  totp_last_step BIGINT NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_admin_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- mfa_at vazio: a senha foi aceita, falta o código do app (sessão curta, só serve para esse passo).
CREATE TABLE admin_sessions (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  admin_id CHAR(36) NOT NULL,
  mfa_at DATETIME(3) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  KEY ix_admin_sessions_admin (admin_id),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id CHAR(36) NULL,
  action VARCHAR(40) NOT NULL,
  detail VARCHAR(300) NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_admin_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
