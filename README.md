# Conecta Ela's

Aplicação web para conectar clientes a profissionais de beleza, cadastrar serviços, horários e agendamentos.

## Publicação na Vercel

- A interface está na raiz do projeto e a API PHP em `api/index.php`.
- Configure na Vercel as variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `APP_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASS` para os ambientes de produção e preview conforme necessário.
- `APP_SECRET` deve ser uma chave aleatória forte com pelo menos 32 caracteres. Nunca use o valor ilustrativo de `.env.example`.
- Crie o banco MySQL e aplique `schema.sql` antes de habilitar os fluxos de login, busca, cadastro e agendamento.
- O runtime PHP é especificado em `vercel.json`.
