# Edição do professor, páginas liberadas e zoom

Na turma, abra **Aulas e apostilas**, expanda a aula e use **Acompanhar → Abrir trabalho**. No trabalho do aluno, selecione **Editar documento do aluno**. O professor responsável e o administrador podem escrever, destacar, mover, redimensionar e alterar respostas. O salvamento é automático. Editar uma entrega não devolve a apostila nem altera a nota; **Devolver para ajustes** e **Registrar correção** continuam sendo ações próprias.

Ao abrir qualquer apostila como professor, expanda **Páginas liberadas aos alunos**. Uma página marcada está liberada; desmarcada, bloqueada. Use **Liberar todas**, **Bloquear todas** ou marque páginas individuais e confirme em **Salvar liberação**. A regra vale para todos os alunos da turma desta apostila, incluindo trabalhos já iniciados. O professor continua vendo todas as páginas. Apostilas existentes permanecem inteiramente liberadas até a primeira configuração.

O aluno conectado verifica mudanças a cada cinco segundos e ao retornar à aba. Respostas em páginas bloqueadas são preservadas no servidor e reaparecem quando liberadas. O bloqueio não recolhe arquivos já baixados nem desfaz conteúdo recebido antes da mudança; sem conexão não existe revogação imediata.

O zoom oferece **Ajustar largura**, **Página inteira**, **Ajustar altura**, percentuais de **25% a 400%** e botões de aumentar/diminuir. A barra continua em uma única linha, com rolagem horizontal em telas estreitas.

## Proteção e armazenamento

- Migração aditiva: `PdfDocument.blockedPages` e `accessVersion`, com valores iniciais seguros para compatibilidade.
- Leituras e escritas verificam instituição, professor responsável ou matrícula; alterações verificam a origem da requisição.
- Permissões usam versão otimista. Escritas do aluno serializam a leitura da permissão com sua gravação e exigem a versão atual, preservando anotações em páginas ocultas. Trabalhos e revisões mantêm o controle de concorrência existente.
- Edições do professor produzem revisão e auditoria com o responsável. Rascunhos locais de professores são separados por professor/documento/aluno; não se misturam entre alunos.
- Alunos nunca recebem o original quando houver bloqueios. PDF.js renderiza somente as páginas liberadas em um documento PDF novo, com marcadores nas páginas bloqueadas. Não são copiados objetos PDF, anexos, metadados ou grafos de destinos do original que possam expor páginas ocultas. Links externos seguros e destinos internos para páginas liberadas são reconstruídos.
- A exportação também usa essa versão restrita e somente as respostas autorizadas. Números de página, dimensões, rotação e recorte são normalizados para manter a posição das respostas.
- A versão restrita apresenta o conteúdo como imagens; texto original não permanece selecionável no arquivo baixado. A renderização limita resolução, processa um documento por vez, reutiliza pedidos iguais e mantém cache de no máximo 24 MB. Erros falham sem fornecer o original como alternativa.
- `@napi-rs/canvas` é dependência obrigatória; PDF.js e canvas permanecem externos ao bundle do servidor. Os arquivos auxiliares ficam em `node_modules/pdfjs-dist` no diretório de execução da aplicação.

Renderização baseada no [exemplo oficial do PDF.js para Node](https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs).

## Verificação

`node --import tsx tests/pdf-page-access.unit.ts` verifica remoção do conteúdo bloqueado, anexos e destinos que referenciam páginas ocultas, preservação de links permitidos, numeração, rotação/recorte e reaproveitamento de renderizações concorrentes.

`tests/pdf-teacher-access.spec.ts` cobre edição pelo professor com entrega preservada, zoom, isolamento, origem, conflito de permissões, proteção do download/exportação, preservação de respostas ocultas, liberação com aluno conectado e bloqueio de todas as páginas.
