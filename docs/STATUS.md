# Registro de implementação

## Fase 1 — Fundação validada

Código implementado: estrutura Next.js/TypeScript, modelo PostgreSQL/Prisma, API REST, instalação inicial protegida, login sem e-mail, hash de senhas, sessão no servidor, troca obrigatória de senha inicial, recuperação supervisionada, cadastros de cursos/turmas/usuários/matrículas, dados isolados por instituição e professor, navegação por perfil, temas claro/escuro e registros de cadastro.

Não há dados fictícios ou integração simulada: as operações dependem do PostgreSQL configurado. Primeira migração criada/aplicada. TypeScript, build e sete testes de fundação aprovados, incluindo login e criação de curso pelo Chromium, persistência, recuperação e isolamento entre instituições/alunos/professores. A auditoria de dependências da instalação limpa reportou zero vulnerabilidades.

## Fase 2 — Núcleo do editor validado

Segunda migração criada/aplicada: aulas, documentos imutáveis, trabalhos individuais, revisões e histórico de feedback. Implementados upload privado de PDF (5 MB/200 páginas), publicação de aulas, PDF.js com worker local, navegação/zoom, inserção/edição/movimentação/exclusão de texto, fonte/cor, destaque por região, autosave com revisão otimista, rascunho local por usuário/documento/aba, sincronização, conflito explícito, entrega, acompanhamento e correção/reabertura pelo professor, exportação com pdf-lib.

Os originais são armazenados no PostgreSQL, sem URLs públicas. Armazenamento de objetos dedicado ainda será integrado. Módulos são um campo de organização da aula nesta etapa; a entidade própria de módulo será acrescentada quando sua administração for implementada.

Validação: 12 testes aprovados, cobrindo a fundação, PDF real de três páginas, desenho das páginas no canvas, posicionamento após zoom, edição offline e sincronização, recuperação ao reabrir, conteúdo incorporado ao PDF exportado, concorrência com HTTP 409, isolamento de respostas, entrega e correção/reabertura. Teste adicional de transformação verifica páginas com rotações 0/90/180/270 graus e recorte. Build de produção e TypeScript aprovados com as rotas do editor.

Falhas encontradas/corrigidas: criação simultânea do primeiro trabalho individual; sobreposição de renderizações no mesmo canvas; distribuição do PDF.js que exigia APIs ainda ausentes no navegador de teste. A distribuição de compatibilidade e seu worker local são usados agora. Testes de edição e sincronização usam PostgreSQL e Chromium reais.

## Ajuste de usabilidade do editor

Barra de ferramentas fixada no topo durante a rolagem, com instrução contextual e indicador de salvamento sempre visíveis. Controles maiores, modo de escrita destacado, opção de ajustar o PDF à largura, fonte/cor agrupadas e indicação nas caixas de resposta vazias. Navegação entre páginas limpa a seleção anterior.

TypeScript e teste de navegador aprovados. A verificação confere a posição da barra após rolagem e o ajuste de largura em tela de celular. A rodada inicial havia sido interrompida por falta de memória/espaço no ambiente; a validação posterior concluiu com sucesso.

## Fase 3 — Provas e atividades

Implementados modelos/migração, API REST, menu e páginas para criar/editar/publicar provas e atividades por aula. Oito tipos de questão: múltipla escolha, verdadeiro/falso, curta, discursiva, associação, lacunas, arquivo e prática. Pontuação por questão, instruções, prazo em horário do Acre, 1 a 10 tentativas, imagens privadas, duplicação com questões/imagens, rascunho e proteção da definição após início das tentativas.

Aluno: início/retomada de tentativa, autosave, recuperação de rascunho local, conflito de versão explícito, anexos privados, entrega e revisão das próprias respostas. Servidor: correção objetiva determinística, pontuação parcial para associações/lacunas, correção manual, feedback, liberação/ocultação de notas, bloqueio após entrega e validação de prazo/tentativas. Gabaritos ficam restritos ao professor.

Validação: sete testes do módulo aprovados, incluindo criação/publicação pelo professor e resposta/retomada/entrega/liberação de nota pelo navegador. Cobrem também oito tipos, correção parcial, acesso entre alunos/professores, upload privado, concorrência no início, revisão antiga, prazo encerrado, limite de tentativas, correção manual, duplicação com imagens e edição/reordenação de rascunho. Os 12 testes anteriores de fundação/PDF passaram na rodada de regressão. TypeScript e build de produção aprovados, com as novas páginas e API de avaliações.

## Área do aluno — Acesso simplificado

Nova interface exclusiva do aluno, com navegação curta, acessos grandes a apostilas e avaliações, continuação do trabalho em andamento, progresso baseado em entregas, busca por aula/título, filtro por turma e correções reunidas. Navegação inferior no celular, temas claro/escuro, conta e troca de senha acessíveis. O painel de professor/admin permanece separado.

API somente de leitura, restrita ao aluno autenticado, lista os próprios materiais/tentativas e apenas conteúdos publicados. Não retorna arquivos, respostas, anotações, gabaritos ou dados dos colegas. Correções de avaliações só são listadas após a liberação das notas. Atalhos de tentativas validam o vínculo com a avaliação antes de abrir; correções de apostilas ficam visíveis antes do PDF.

TypeScript e build de produção aprovados. Os 20 testes passaram na validação por grupos (7 de avaliações, 12 de fundação/PDF/área do aluno e 1 de exportação), incluindo navegação pelo início até a apostila, pesquisa, continuação, acesso direto às correções de provas, notas liberadas, tema claro/escuro, celular sem rolagem horizontal e proteção de dados/conteúdos não publicados. As verificações usam PostgreSQL e Chromium reais sobre a versão compilada para reduzir o consumo de memória do servidor de desenvolvimento.

O servidor local foi reiniciado na porta 3000 com a versão compilada (`next start`), evitando a compilação durante a navegação neste computador com poucos recursos. Após novas alterações no código, é necessário gerar novo build e reiniciar esse servidor, ou usar `npm run dev` quando houver memória/espaço suficientes.

## Provas e atividades — Formato de formulário

Interface inspirada no Google Forms: coluna central, fundo lilás, cabeçalho destacado, perguntas em cartões, campos de resposta com linha e alternativas de seleção ampla. O aluno acompanha o preenchimento, pode limpar uma seleção, salvar o rascunho e entregar após revisar. A contagem de associação/lacunas só considera a questão preenchida quando todos os itens têm resposta. Mantidos os oito tipos de questão, autosave, entrega e liberação de notas.

No editor do professor, alternativas de múltipla escolha têm campos individuais, adição/remoção e seleção direta do gabarito. A remoção de uma alternativa ajusta o índice da resposta correta. Validação com TypeScript, build e sete testes de avaliações, incluindo criação pelo professor, gabarito após remoção de alternativa, limpeza de seleção, retomada, entrega, correção e celular sem rolagem horizontal.

## Revisão dos erros pelo aluno

Após entrega, correção completa e liberação das notas, cada questão mostra acerto/erro/acerto parcial, pontuação e resposta correta. Associação e lacunas detalham cada item; respostas curtas mostram as respostas aceitas. Questões manuais mostram pontuação e comentário do professor ao lado da resposta original.

O gabarito é enviado somente na consulta da própria tentativa entregue e corrigida, com notas liberadas. Continua oculto na definição pública, nos rascunhos, antes da liberação e para outros alunos. Ao ocultar as notas, novas consultas também deixam de retornar o gabarito. Build aprovado e oito testes de avaliações cobrem esses controles e a revisão no navegador, incluindo erros, acertos parciais e feedback manual no celular.

## Implantação na VPS

Plataforma publicada em https://191.252.155.205, com certificado público pelo IP, renovação automática, Nginx, PostgreSQL 17 privado e execução como usuário sem privilégios via systemd. Firewall permite apenas SSH/HTTP/HTTPS. Dados de uso locais migrados, preservando cadastros e senhas; banco de testes não transferido. Banco local e remoto passam a ser independentes.

Backup diário com retenção de 14 dias na própria VPS, restauração validada em banco separado. Fluxo de navegador real aprovado no endereço público: login, cookie seguro, PDF/upload/autosave/exportação, avaliação/entrega/revisão dos erros e proteção de dados. Registros de validação removidos. Origem pública configurável por `APP_ORIGIN` corrige o uso atrás do proxy sem aceitar origens externas. Consulte `docs/IMPLANTACAO-VPS.md` para operação e limites.

## Organização dos detalhes da turma e senhas dos alunos

Senhas de alunos aceitam a partir de quatro caracteres no cadastro, primeiro acesso, troca pessoal e redefinição. Professores e administradores mantêm mínimo de dez; o servidor consulta o perfil real do usuário na troca/redefinição. Interface e regras de instalação inicial compatíveis, mantendo hash bcrypt, limite UTF-8, revogação de sessões e troca obrigatória de senha temporária.

Janela da turma ampliada, com seções Resumo, Alunos, Aulas e apostilas e Provas e atividades. Cadastro e matrícula diretamente na turma, busca de alunos e aulas, cartões de apostilas e estado de publicação legíveis. Avaliações integradas na própria seção sem uma nova janela de navegação. Rascunhos de formulários preservados ao alternar seções na janela. Navegação de abas por teclado e layout responsivo.

TypeScript e build Linux aprovados. Validações no endereço público pelo Chromium real cobriram senhas de quatro caracteres, bloqueio de senhas menores/perfis de gestão, primeiro acesso, troca/reset/revogação, navegação e cadastro/matrícula na turma, buscas, retenção de rascunhos, PDF/publicação e criação de avaliação. Capturas desktop e celular inspecionadas. As atualizações preservam os cadastros reais e removem somente dados temporários da verificação.

## Turma como página própria

O acesso Abrir turma agora navega para `/turmas/[id]`. Detalhes da turma deixam o modal e usam uma página normal, com título da turma, retorno às turmas, tema e as quatro seções existentes. Cadastro/matrícula atualiza a página sem perder a seção e os formulários abertos. A rota verifica sessão, troca obrigatória de senha, instituição e professor responsável antes de retornar os dados. Alunos permanecem na área exclusiva do estudante.

TypeScript e build de produção aprovados. Teste no endereço público validou link da turma, ausência de modal, recarregamento, retorno e reabertura, seções, matrícula/cadastro com senha de quatro caracteres, busca, PDF/publicação e criação de avaliação. Proteção conferida no navegador: alunos/professores de outra turma recebem a página de não encontrado sem dados da turma, professor responsável tem acesso e visitante retorna ao login. Captura da página desktop inspecionada e layout móvel validado.

## Renomeação das apostilas

Professor responsável e administrador podem renomear PDFs existentes em Turma → Aulas e apostilas → Renomear. Formulário com nome, salvar e cancelar; valida nome obrigatório, até 150 caracteres e sem caracteres de controle. Atualização transacional apenas do título com registro de auditoria. Identificador, bytes, hash, trabalhos, respostas, entregas e correções preservados. O nome atualizado aparece para o aluno e nos downloads original/respondido, com nome UTF-8 seguro.

TypeScript e build aprovados. Teste no HTTPS público pelo navegador conferiu cancelar, nome inválido, persistência após reload, autorização de administrador/professor responsável, bloqueio de aluno/outro professor, conteúdo original idêntico, trabalho e respostas intactos, listagem do aluno e nomes dos downloads. Layout móvel inspecionado sem rolagem horizontal. Registros temporários removidos após a validação.

## Importação de Google Forms

Botão Importar Google Forms nas avaliações da turma, com exportador Apps Script disponível na tela e por download. Importa arquivo JSON do exportador ou da estrutura oficial da API Forms. Prévia sem gravação, avisos de adaptação, seleção da aula e revisão no editor existente antes de salvar como rascunho. Sem OAuth/credenciais Google no servidor e sem importação direta por link.

Múltipla escolha/lista e respostas curtas compatíveis preservam os gabaritos disponíveis; alternativas sem gabarito ficam sem seleção e precisam ser revisadas. Grades viram perguntas por linha; marcação múltipla/outros tipos são adaptados para correção manual com aviso. Imagens, lógicas de seção e configurações não compatíveis são sinalizadas. Nenhuma resposta de aluno é importada. IDs novos, validação de limites, autorização por turma e rascunho privado pelas APIs existentes.

Sete testes do conversor/exportador simulados aprovados, oito testes de regressão das avaliações aprovados e builds local/Linux aprovados. Fluxo público no Chromium validou exportador disponível, arquivo inválido, prévia sem gravação, permissões, atualização da lista de aulas ao voltar à seção, gabarito ausente sem seleção automática (inclusive após remover alternativa), revisão, salvamento privado e celular sem rolagem horizontal. O exportador foi validado por simulação e documentação oficial, sem execução em conta Google real. Registros temporários removidos. Instruções e limites em `docs/IMPORTAR-GOOGLE-FORMS.md`.

## Exportador Google Forms — compatibilidade v2

Após relato real de operação incompatível no Apps Script, removidas as consultas de feedback e navegação que não são usadas na importação. Leituras de pontuação, gabarito e opção Outro agora tratam falhas e geram avisos para revisão. Se uma alternativa não puder ter o gabarito lido, o gabarito inteiro da questão permanece pendente, evitando adivinhar uma resposta com dados parciais. O importador mostra os avisos do exportador.

Oito testes aprovados, incluindo simulação da mesma exceção em métodos opcionais. TypeScript e build Linux aprovados. Verificação do arquivo público v2, exportação simulada com falhas e prévia autenticada na VPS aprovadas; sem gravação automática de avaliação. O código já copiado no Google precisa ser substituído pelo usuário pela nova função. Não houve execução em conta Google real.

## Pendências gerais

- Administração de múltiplas instituições na interface; a instalação inicial cria uma instituição.
- Edição/arquivamento dos cadastros, desativação de usuários e remoção de matrículas.
- Importação CSV e convites.
- Ampliar o editor: desenho livre, camada de seleção do texto original, campos AcroForm, fontes Unicode completas e controle visual de tamanho das caixas/destaques.
- Integrar Supabase Storage ou equivalente para originais, com quotas e backups dos objetos.
- Fase 4: relatórios PDF/Excel, médias por turma/avaliação e evolução dos indicadores de desempenho.
- Política de LGPD/retenção, monitoramento externo e cópia dos backups fora da VPS.

## Ocorrências do ambiente

Links incorporados a PDFs: camada clicável sobre a página, sites em nova aba com `noopener noreferrer` e destinos internos por página ou nome. Posição acompanha zoom, rotação e recorte; acesso por teclado e toque, tanto na prévia quanto na edição. Clique no link não cria anotação. Somente HTTP(S), e-mail e telefone são permitidos; ações JavaScript do PDF não são executadas. Dois testes de navegador e regressão de exportação aprovaram abertura, navegação, alinhamento, salvamento de respostas e prévia móvel. TypeScript e build aprovados.

Google Forms: exportador v3 com ZIP e imagens, prévia de associação por pergunta e galerias privadas para professor/aluno. Imagens incorporadas a perguntas/alternativas usam a função completa com configuração da API na conta Google do proprietário; imagens separadas usam a função simples. Salvamento permite repetir uploads após falha sem duplicar rascunho ou imagens. Build e TypeScript, 12 testes unitários, oito regressões de avaliações e fluxo público com imagens/reenvio/cópia/celular aprovados. Google foi simulado nos testes do exportador, sem autorização de conta real. Consulte `IMPORTAR-GOOGLE-FORMS.md`.

A instalação inicial foi interrompida por falta de espaço no disco C:. Após liberação de espaço, as dependências foram reinstaladas com lockfile, o Docker Desktop iniciou e o PostgreSQL local ficou saudável. Um novo esgotamento de memória interrompeu uma rodada de testes; as execuções seguintes usaram limite de heap menor e concluíram. O espaço livre permanece reduzido; nenhuma limpeza de arquivos pessoais foi realizada.

Durante a Fase 3 o disco voltou a esgotar. A limpeza automática do cache de testes foi bloqueada pela política do ambiente. Foi possível recuperar espaço com compactação NTFS apenas em `node_modules`, sem excluir arquivos. Os testes passaram a desabilitar o cache persistente de compilação para reduzir gravações. O servidor local foi pausado durante a validação para liberar memória.
