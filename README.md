# Portal Útil

Portal responsivo de ferramentas úteis, preparado para Cloudflare Workers + Assets + D1.

## Ferramentas incluídas
- Gerador de Currículo (impressão / salvar como PDF pelo navegador)
- Criador de Recibo
- Orçamento Rápido
- Controle de Gastos com persistência no D1
- Calculadora de Juros simples/compostos
- Divisor de Contas
- Gerador de Declaração
- Checklist Diário com persistência no D1
- Simulador de Empréstimo (Tabela Price / parcela fixa)
- Cadastro/login, favoritos e histórico
- PWA básica
- Estrutura de plano Free/Premium

## Deploy no Cloudflare
1. Crie um repositório no GitHub e envie todos os arquivos deste projeto.
2. No Cloudflare, crie um banco D1 chamado `portal-util-db`.
3. Copie o `database_id` mostrado pelo Cloudflare.
4. Abra `wrangler.jsonc` e substitua `COLE_AQUI_O_DATABASE_ID` pelo ID real.
5. No terminal, execute `npm install`.
6. Autentique o Wrangler, se necessário: `npx wrangler login`.
7. Crie as tabelas no D1 remoto: `npm run db:remote`.
8. Publique: `npm run deploy`.

### Deploy automático pelo GitHub
No painel do Cloudflare, conecte o repositório ao Workers Builds/Git integration. Com `wrangler.jsonc` no repositório, use `npm run deploy` como comando de deploy quando solicitado. Certifique-se de que o D1 criado esteja associado ao binding `DB` e que o `database_id` no arquivo esteja correto.

## Desenvolvimento local
```bash
npm install
npm run db:local
npm run dev
```

## Tornar um usuário Premium manualmente
No console D1:
```sql
UPDATE users SET plan='premium' WHERE email='cliente@exemplo.com';
```

## Pagamentos
A versão 1.0 não realiza cobrança automática. O botão Premium informa isso explicitamente. Para monetização automática, integre posteriormente um gateway (por exemplo Asaas/Mercado Pago) e atualize `users.plan` via webhook após pagamento confirmado.

## Segurança
Senhas são derivadas com PBKDF2-SHA-256, salt aleatório e 120.000 iterações. Para uma operação comercial completa, adicione também recuperação de senha, verificação de e-mail, rate limiting e política de sessões/dispositivos.

## Atualização de documentos profissionais

Esta versão acrescenta:
- 4 modelos de currículo, foto opcional e exportação Word/PDF;
- recibos com logo opcional, 4 modelos e exportação Word/PDF;
- orçamentos com múltiplos itens, logo, 4 modelos e exportação Word/PDF;
- declaração com modelos e exportação Word/PDF;
- resultados visuais aprimorados em juros, divisor e empréstimo;
- Organizador de PDF: múltiplos arquivos, reordenação, seleção/exclusão de páginas e geração de um único PDF;
- processamento dos PDFs feito no navegador, sem upload para o Worker/D1.

### Bibliotecas de navegador
A exportação direta para PDF usa html2canvas + jsPDF. O organizador de PDF usa pdf-lib. Elas são carregadas no navegador via jsDelivr, sem API paga.

### Banco existente
O banco atual não precisa ser recriado. O arquivo `schema.sql` representa uma instalação nova completa. Para banco já existente, use `migration-existing-db.sql` apenas para os índices; a coluna `role` já foi criada no ambiente atual.


## Atualização visual V3
- Documentos com 4–5 modelos profissionais e exportação Word/PDF preservando o layout.
- Tabelas de orçamento com larguras fixas e colunas numéricas centralizadas.
- Assinaturas sempre centralizadas sob a linha.
- Painéis de resultados com estilos Corporativo, Esmeralda e Executivo/Premium.
