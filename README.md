# Conecta Ela's

Aplicação web para conectar clientes a profissionais de beleza, cadastrar serviços, horários e agendamentos.

## Supabase

- Banco PostgreSQL isolado: `conectaelas`, região São Paulo (`sa-east-1`).
- Migração de schema: `supabase/migrations/20261015100000_initial_schema.sql`.
- API server-side: Supabase Edge Function `conectaelas-api`; a chave secreta é lida do ambiente seguro de Edge Functions e nunca vai ao navegador ou ao GitHub.
- O frontend usa apenas a chave publicável em `supabase-config.js`. As tabelas têm RLS ativado e sem políticas de acesso público; somente a função de servidor usa a chave privilegiada.
- Senhas da aplicação são armazenadas com PBKDF2-SHA256, salt aleatório e 310.000 iterações.

## Deploy

A interface estática é publicada pela Vercel a partir da branch `main`. A API e o banco são hospedados pelo Supabase. A função autentica os tokens da aplicação e aplica autorização por perfil.
