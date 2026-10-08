-- Mensagens do formulário "Fale com a Ju" (contato.html → /api/contact/send, api/_lib/contact.js). Cada mensagem válida
-- fica guardada aqui ANTES do aviso por e-mail, então um e-mail que não sai não perde a mensagem: a Ju lê tudo no Painel
-- (Mensagens, api/admin/messages.js). phone_enc: o WhatsApp opcional de quem escreveu, só números com o código do país,
-- cifrado como orders.phone_enc (AES-256-GCM, DATA_KEY). order_ref: o primeiro número de pedido (JU-…) citado no texto.
-- status: nova (caixa de entrada) ou spam (guardada, sem aviso por e-mail e fora das Novas). read_at / replied_at /
-- archived_at: o que a equipe fez com ela (read_by = quem abriu). Ficam 12 meses (spam, 30 dias): o purge() das lojas apaga
-- as mais antigas, como diz a Política de Privacidade.

CREATE TABLE contact_messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(180) NOT NULL,
  phone_enc VARBINARY(96) NULL,
  subject VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  order_ref VARCHAR(24) NULL,
  lang VARCHAR(5) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'nova',
  mailed_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  read_by VARCHAR(180) NULL,
  replied_at DATETIME(3) NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_contact_messages_created (created_at, id),
  KEY ix_contact_messages_inbox (status, archived_at, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
