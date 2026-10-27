# Implantação da plataforma Aprender

Endereço público: https://191.252.155.205 (sem domínio).

Após a validação da implantação, o usuário solicitou e confirmou a limpeza dos dados. Foi criado um backup antes da operação. Naquela limpeza foram preservadas a instituição `ise` e a conta `admin`, com senha e configurações; os demais usuários, cursos, turmas, aulas, apostilas, avaliações e respostas foram removidos em uma transação. O banco local não foi alterado. Novos cadastros realizados pelo usuário após essa limpeza são preservados nas atualizações.

## Serviços

- Ubuntu 24.04, Node.js 22, PostgreSQL 17 e Nginx.
- Aplicação executada como usuário de sistema `aprender`, pelo serviço `aprender.service`.
- Código em `/opt/aprender/releases/`, com a versão ativa apontada por `/opt/aprender/current`.
- Banco `escola`, schema `escola`. Credenciais exclusivas em `/etc/aprender.env`, acessível apenas por root e pelo grupo da aplicação.
- `APP_ORIGIN=https://191.252.155.205` valida a origem pública das escritas atrás do proxy HTTPS. Outros sites continuam bloqueados.
- Nginx recebe conexões nas portas 80 e 443 e redireciona HTTP para HTTPS. Aplicação e PostgreSQL escutam somente em loopback.
- Uploads aceitam até 5 MB (5.000.000 bytes) por arquivo. O proxy permite corpos de 6 MiB e a aplicação reserva até 5,5 MB para o multipart, validando separadamente o tamanho real do arquivo.
- Firewall permite SSH, HTTP e HTTPS. Serviços habilitados na inicialização do servidor.
- Alunos podem usar senhas a partir de 4 caracteres; professores e administradores mantêm mínimo de 10. A validação usa o perfil registrado no servidor na troca e na redefinição, e preserva a troca obrigatória de senhas temporárias.

Os cadastros, senhas protegidas por hash e materiais existentes no schema local `escola` foram transferidos. Sessões antigas foram encerradas na cópia de produção; é necessário entrar novamente. O schema de testes local não é publicado. O banco da VPS passa a ser independente do banco local.

## HTTPS pelo IP

Certificado público Let's Encrypt para o IP, obtido com Certbot 5.8 em `/opt/aprender-certbot`. Certificados de IP têm validade curta; `aprender-certbot.timer` verifica a renovação a cada seis horas. A renovação recarrega o Nginx. O desafio HTTP fica em `/var/www/letsencrypt`.

Referência oficial: [certificados de IP e Certbot](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).

```bash
systemctl status aprender nginx postgresql@17-main
systemctl list-timers 'aprender-*'
journalctl -u aprender -n 100 --no-pager
/opt/aprender-certbot/bin/certbot certificates
/opt/aprender-certbot/bin/certbot renew --dry-run
```

## Backups

`aprender-backup.timer` executa um backup diário por volta de 03h no Acre (08h UTC), mantendo 14 dias em `/var/backups/aprender/`. O dump inclui arquivos PDF, anexos e respostas, armazenados no PostgreSQL. Arquivos de backup são privados.

```bash
systemctl start aprender-backup.service
journalctl -u aprender-backup.service -n 20 --no-pager
```

Os backups ficam na própria VPS. Uma cópia externa não está configurada; a perda completa do disco também afetaria essas cópias. Para recuperação, primeiro restaure o dump em um banco separado, confira os dados e só então planeje a substituição do banco em uso. Não restaure diretamente sobre o banco ativo.

## Atualizações

Prepare uma nova pasta em `/opt/aprender/releases/`, instale as dependências com `npm ci`, gere o cliente Prisma e compile com `npm run build`, usando as variáveis de `/etc/aprender.env`. Não inclua `.env` local, bancos de testes ou `node_modules` do Windows no pacote. Execute como `aprender`, com limite de memória adequado à VPS.

Antes de aplicar migrações, execute um backup. Aplique `npm run db:migrate` usando a credencial de produção. Aponte o link `/opt/aprender/current` para a nova pasta somente depois do build aprovado e reinicie `aprender.service`. Confira login, upload privado, salvamento das apostilas e entrega/correção das avaliações pelo endereço HTTPS.

Os modelos de serviço, proxy e agendamentos estão em `deploy/`. Contêm o IP desta implantação e devem ser ajustados se o servidor mudar. Credenciais SSH e senhas de banco não estão nesses arquivos.

## Validação da implantação

Build Linux e migrações aprovados. Renovação do certificado validada com `certbot renew --dry-run`. Backup restaurado com sucesso em um banco temporário separado e removido após a conferência: uma instituição, dois usuários, um curso e duas avaliações originais.

Uma instituição temporária foi usada para testar pelo Chromium real: login administrativo e do aluno via HTTPS com cookie Secure/HttpOnly, bloqueio de origem externa nas três APIs de escrita, cadastro/matrícula, publicação e renderização de PDF, edição com autosave e retomada, exportação, entrega da avaliação e gabarito oculto até a liberação. Após a liberação, o aluno visualizou o erro e a resposta correta. Layout de celular e bloqueio de arquivo privado sem autenticação também conferidos. Os registros temporários foram removidos ao terminar.

Atualização do limite de upload publicada: apostilas, imagens e anexos de respostas aceitam arquivos de exatamente 5.000.000 bytes; arquivos com 5.000.001 bytes foram rejeitados com HTTP 413 no endereço público. Os testes também conferiram a recuperação integral de PDF e anexo no limite. Dados temporários removidos após a validação, mantendo a plataforma limpa.

Senhas de alunos com 4 caracteres validadas pelo navegador em cadastro, primeiro acesso, troca pessoal, redefinição e novo login. Senhas de 3 caracteres foram recusadas. Professores e administradores continuam exigindo 10, inclusive quando o corpo da requisição tenta informar outro perfil. Sessões antigas são revogadas na redefinição e a troca obrigatória permanece.

A janela Detalhes da turma foi ampliada e dividida em Resumo, Alunos, Aulas e apostilas, Provas e atividades. Testes no endereço público conferiram navegação por teclado, busca, matrícula, cadastro direto de aluno com senha de 4 caracteres, manutenção de rascunhos ao trocar de seção, aula/PDF/publicação e criação de avaliação na seção da turma. Layout desktop e celular inspecionados; sem rolagem horizontal no celular. Somente os registros da instituição temporária de validação são removidos ao concluir.

Atualização posterior: Detalhes da turma passou a ser a página `/turmas/[id]`, acessada pelo link Abrir turma. Mantém as quatro seções, tema, cadastro/matrícula e formulários, com retorno às turmas e recarregamento normal. A rota verifica instituição e professor responsável no servidor. Validação pública pelo Chromium conferiu navegação sem modal, acesso direto/reload, retorno/reabertura, seções, matrícula/cadastro, PDF/publicação e avaliação. Alunos e professores de outra turma não recebem os dados, o responsável acessa sua turma e visitantes são redirecionados para o login. Build e TypeScript aprovados; dados temporários removidos.

Renomeação de PDFs publicada: em Aulas e apostilas, o botão Renomear permite salvar ou cancelar o novo título. Somente administrador e professor responsável podem executar. Testes públicos conferiram atualização do título para aluno e downloads, nomes UTF-8, conteúdo e respostas preservados, validação e bloqueio de outros perfis/turmas. Metadados atualizados sem migração de banco. Dados temporários removidos ao concluir.
