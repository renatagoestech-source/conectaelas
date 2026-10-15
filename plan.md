# Plano — identidade visual, demonstrações e temas

## Direção de design

- **Movimento:** beleza contemporânea com editorial feminino, inspirada diretamente na marca fornecida.
- **Princípios:** preservar o símbolo original; aplicar vinho e nude já usados pelo produto; manter contraste e legibilidade nos dois temas; identificar claramente todo conteúdo fictício.
- **Paleta:** vinho `#7B1E3A`, rosé `#A8506A`, nude `#B88B74`; no modo escuro, superfícies ameixa profundas e texto claro.
- **Layout e interação:** marca horizontal no cabeçalho com o símbolo e o slogan em texto acessível; controle de tema sempre disponível na navegação; modo escolhido persiste neste navegador.
- **Demonstrações:** perfis e serviços sintéticos, rotulados publicamente como demonstração; nenhum contato real, nenhum agendamento habilitado nesses perfis; aba administrativa separada para removê-los.
- **Segurança administrativa:** criar um usuário administrador inicial no Supabase; guardar somente hash de senha no banco e não colocar credenciais no código.

## Estrutura

- `index.html`: cabeçalho com marca e slogan, ícone e inicialização do tema.
- `assets/conectaelas-mark.png`: símbolo fornecido, sem fundo e harmonizado à paleta.
- `style.css`: variáveis de cor compartilhadas pelos temas claro e escuro.
- `app.js`: alternância persistente, rótulos dos perfis demonstrativos e aba de remoção administrativa.
- `supabase/functions/conectaelas-api/index.ts`: exposição da marca de demonstração, autorização e exclusão apenas de perfis de demonstração.
- `supabase/migrations/`: migração da coluna `is_demo`; dados fictícios adicionados ao banco Supabase.
- Deploy: GitHub `main` aciona Vercel; a API segue no Supabase Edge Functions.
