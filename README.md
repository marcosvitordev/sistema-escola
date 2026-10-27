# Aprender · Plataforma educacional

Aplicação Next.js com App Router, React, TypeScript, API REST e persistência PostgreSQL via Prisma. Interface em português, com temas claro e escuro. Fundação, núcleo do editor PDF e módulo de provas e atividades implementados. Relatórios exportáveis e recursos avançados continuam nas etapas seguintes.

## Executar localmente

Requisitos: Node.js 22 ou superior, npm e PostgreSQL (ou Docker Desktop iniciado).

```powershell
npm ci
node scripts/init-env.mjs
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

Abra http://localhost:3000. Selecione **Primeiro acesso da instituição** para cadastrar a instituição e o administrador. Use o código `BOOTSTRAP_TOKEN` do arquivo `.env`, gerado pelo comando de configuração. A instalação inicial fica bloqueada assim que a primeira instituição é criada. Não existem usuários ou senhas compartilhados de demonstração.

Se utilizar um servidor PostgreSQL existente, configure `DATABASE_URL` e omita o comando Docker. O schema `escola` mantém as tabelas fora do schema público. Não exponha esse schema pela Data API do Supabase. O navegador acessa somente a API autenticada do Next.js; as credenciais do banco permanecem no servidor.

## Fluxo da fundação

1. Administrador instala a instituição e cadastra professores.
2. Professor entra com instituição, usuário e senha individual, e troca a senha inicial.
3. Professor cria um curso, uma turma sob sua responsabilidade e cadastra os alunos nessa turma.
4. Aluno entra e troca sua senha inicial. Visualiza apenas as próprias turmas.
5. Professor ou administrador pode redefinir uma senha temporária individual. A operação encerra as sessões do usuário e exige nova troca de senha.

Senhas de alunos aceitam a partir de **4 caracteres**, no cadastro, na troca pessoal e na redefinição pelo professor/administrador. Professores e administradores continuam com mínimo de **10 caracteres**. A troca obrigatória no primeiro acesso e após redefinição continua ativa.

## Detalhes da turma

Ao abrir uma turma no painel de gestão, a página `/turmas/[id]` reúne as seções **Resumo**, **Alunos**, **Aulas e apostilas** e **Provas e atividades**. O resumo reúne os acessos principais. Em Alunos, é possível buscar, cadastrar um novo aluno diretamente na turma ou matricular alguém já cadastrado. As aulas têm busca por título/módulo, apostilas separadas e indicação de rascunho/publicação. Avaliações podem ser criadas e consultadas na própria seção. Os formulários em andamento permanecem ao trocar de seção na mesma página. A página tem acesso por link direto, recarregamento normal e botão para voltar às turmas; é restrita aos gestores autorizados da turma.

## Área simplificada do aluno

O aluno tem um início próprio, separado do painel de gestão. Os acessos principais são **Apostilas**, **Provas e atividades** e **Minhas correções**. No celular, ficam em uma barra de navegação na parte inferior da tela, com botões grandes e nomes curtos.

O início destaca trabalhos em andamento e permite abrir a apostila ou continuar a tentativa diretamente. Os cartões mostram a aula, a turma e estados reais: para fazer, em andamento, entregue, prazo encerrado ou correção disponível. A busca e o filtro de turma ajudam a encontrar materiais antigos. O progresso conta materiais e avaliações efetivamente entregues.

Só aparecem aulas e avaliações publicadas das turmas em que o aluno está matriculado. Notas de avaliações ainda não liberadas não aparecem no início nem na área de correções. Os atalhos de correção abrem o trabalho ou a tentativa individual; a correção da apostila aparece antes da página do PDF e pode ser recolhida.

Os conteúdos são atualizados ao retornar à janela, a cada 30 segundos enquanto ela estiver visível e pelo botão **Atualizar**. A conta do aluno reúne tema claro/escuro, troca de senha e saída. O primeiro acesso mantém a troca obrigatória de senha.

## Apostilas interativas

Abra **Turmas → Abrir turma → Nova aula**. Crie a aula em rascunho, envie um PDF e selecione **Publicar aula**. Os alunos matriculados podem abrir o material, navegar pelas páginas, inserir respostas, movê-las, mudar fonte/cor e destacar regiões. O original não é alterado.

As anotações são individuais e salvas após 700 ms de pausa. Cada atualização exige a revisão atual; conflitos preservam o rascunho e exigem escolha explícita. Rascunhos temporários são separados por usuário/documento/aba no navegador. A sincronização é repetida ao reconectar e a cada cinco segundos quando existem alterações pendentes.

Para renomear um PDF já enviado, abra **Turma → Aulas e apostilas → Renomear**, ao lado da apostila. Digite o nome e selecione **Salvar nome**. O professor responsável e o administrador podem renomear; arquivo, respostas, entregas e correções permanecem vinculados à mesma apostila. O nome atualizado aparece para os alunos e nos downloads, incluindo a exportação respondida.

O botão **Entregar apostila** bloqueia a edição depois de confirmar o salvamento. O professor usa **Acompanhar → Abrir trabalho** para consultar respostas, registrar comentário/nota e reabrir a edição. Há exportação do documento preenchido, sem alterar o original. A exportação inicial usa fonte Helvetica e aceita o repertório latino, incluindo português; caracteres fora desse repertório exibem erro de exportação.

Nesta versão os originais ficam em `bytea` no PostgreSQL, privados e protegidos pela mesma autorização da API. Limites: **5 MB por arquivo, 200 páginas**, até 400 mil caracteres de JSON de anotações. Isso permite persistência real em desenvolvimento e implantação inicial sem credenciais adicionais. Migre os originais para armazenamento de objetos privado (como Supabase Storage) antes de ampliar o volume; o navegador deve continuar acessando documentos pela autorização do servidor. Rascunhos locais exigem espaço no armazenamento do navegador e um perfil individual em computadores compartilhados.

O administrador pode cadastrar alunos sem turma e matriculá-los depois. Professores cadastram alunos diretamente em uma de suas turmas; não podem buscar cadastros de turmas de outros professores.

## Provas e atividades

Use **Importar Google Forms** para trazer um formulário seu por ZIP com imagens ou JSON, com exportador e passo a passo na própria tela. A prévia permite conferir a associação das imagens às perguntas e indica adaptações e gabaritos ausentes. O exportador v3 inclui imagens separadas; imagens dentro de perguntas e alternativas exigem a função completa e a configuração da API Google Forms descritas na tela. Revise e salve como rascunho antes de publicar. Veja [como importar e quais tipos são compatíveis](docs/IMPORTAR-GOOGLE-FORMS.md).

No menu **Provas e atividades**, escolha uma turma e clique em **Nova prova ou atividade**. A turma precisa ter pelo menos uma aula cadastrada. Selecione o formato, a aula, o título, as instruções, o prazo opcional (horário do Acre) e o número de tentativas (1 a 10).

Tipos disponíveis: múltipla escolha, verdadeiro/falso, resposta curta, discursiva, associação de colunas, lacunas, envio de arquivo e atividade prática. Cada questão tem pontuação própria e pode receber uma imagem PNG/JPEG depois de salvar o rascunho. Nas lacunas, use `[___]` no enunciado. Questões curtas aceitam uma lista de respostas corretas; a comparação ignora maiúsculas/espaços extras e preserva a acentuação.

Salve o rascunho, confira as questões e selecione **Publicar avaliação**. A aula também deve estar publicada. Os alunos matriculados acessam a avaliação, iniciam uma tentativa, respondem no navegador, salvam/retomam o rascunho e entregam. Respostas são salvas automaticamente após uma pausa e têm proteção contra versões concorrentes. Rascunhos textuais locais são recuperados ao reabrir; enviar anexos exige conexão.

O servidor verifica prazo e limite de tentativas em cada operação. Uma tentativa entregue fica bloqueada. As questões e imagens ficam protegidas após a primeira tentativa ser iniciada; o professor pode duplicar a avaliação para reutilizar/alterar perguntas e imagens. Prazo e limite de tentativas continuam ajustáveis pelo professor.

Questões objetivas têm correção determinística, sem IA; associação/lacunas recebem pontuação proporcional aos itens corretos. Discursivas, arquivos e relatos de atividade prática são corrigidos pelo professor. A área de entregas mostra alunos sem início, em andamento, aguardando correção e corrigidos. As notas e feedbacks só ficam visíveis aos alunos após **Liberar notas**, e somente quando a tentativa estiver totalmente corrigida. A pontuação e sua equivalência de 0 a 10 são exibidas separadamente.

Anexos privados ficam no PostgreSQL, com validação de tamanho e assinatura do arquivo. Formatos das respostas: PDF, PNG, JPEG ou TXT UTF-8, até 5 MB. Imagens das questões: PNG/JPEG, até 5 MB. O gabarito aparece somente na própria tentativa entregue e totalmente corrigida, depois da liberação das notas. Cada questão mostra acerto/erro/acerto parcial, resposta correta, pontuação e feedback; a definição e os rascunhos continuam sem gabarito. Respostas dos colegas permanecem privadas.

## Comandos

- `npm run dev`: ambiente de desenvolvimento.
- `npm run build`: gera o cliente Prisma e a aplicação de produção.
- `npm start`: executa o build de produção.
- `npm run typecheck`: verifica TypeScript.
- `npx playwright install chromium`: instala o navegador para os testes de interface.
- `npm test`: aplica migrações no schema `escola_test` e executa os testes de integração e navegador na porta 3001. Esse schema é apagado pelos testes; use um banco local/de teste. O schema de uso `escola` é preservado.
- `npm test -- tests/assessments.spec.ts`: executa apenas os testes de provas e atividades.
- `node --import tsx --test tests/google-forms-import.unit.mjs`: testa o conversor e o exportador de Google Forms sem acessar o banco ou uma conta Google.
- Para testar a versão compilada no PowerShell: execute `npm run build`, defina `$env:PLAYWRIGHT_USE_BUILD='1'` e execute `npm test`. O servidor de teste usará o build existente com o schema isolado.
- `npm run db:dev -- --name descricao`: cria migração de desenvolvimento.
- `npm run db:migrate`: aplica migrações versionadas.

Para reduzir gravações de cache em máquinas com pouco espaço, defina `NEXT_LOW_DISK=1` no ambiente do processo. Os testes usam essa opção automaticamente. O cache normal continua habilitado nas demais execuções. Essa configuração não substitui espaço suficiente para compilar a aplicação e armazenar os dados.

## Segurança e operação

Senhas com bcrypt (custo 12, limite de 72 bytes UTF-8), cookies HttpOnly/SameSite, sessões de oito horas com tokens aleatórios e somente hashes armazenados. Cookies Secure em produção. Recuperação e troca de senha revogam sessões. Há limitação persistida de tentativas por instituição/usuário, validação Zod e autorização em cada operação. Requisições de escrita verificam a origem quando presente; produção deve usar HTTPS e manter o host/origin coerentes atrás do proxy.

Use uma credencial PostgreSQL exclusiva da aplicação, acesso restrito ao schema `escola` e TLS no banco remoto. Não use a credencial de desenvolvimento em produção. Não publique `.env`. Configure backups PostgreSQL diários, retenção e teste de restauração antes de receber dados reais. A implantação ainda requer revisão de LGPD, política de retenção e monitoramento operacional; o código não constitui certificação de conformidade.

## Documentação

Veja [arquitetura e modelo](docs/ARQUITETURA.md), [entregas e pendências](docs/STATUS.md) e [operação na VPS](docs/IMPLANTACAO-VPS.md). A implantação de produção usa a VPS autorizada, com HTTPS pelo IP.
