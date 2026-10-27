# Importar avaliações do Google Forms

Abra **Turma → Provas e atividades → Importar Google Forms**. A turma precisa ter uma aula para receber a avaliação. A importação funciona por arquivo JSON e não exige credenciais Google no servidor. Importação direta por link/OAuth não está configurada.

## Exportar seu formulário

1. Abra o formulário no Google Forms em modo de edição.
2. No menu de três pontos, abra **Editor de scripts**.
3. Na tela de importação do Aprender, abra **Como exportar meu formulário do Google?** e copie ou baixe o exportador. Cole o código ao final dos scripts existentes, sem removê-los.
4. Salve e execute `exportarParaAprender`. Autorize na sua própria conta Google.
5. Retorne à aba do formulário e use **Baixar arquivo para importar** na janela do exportador.
6. Envie o JSON na plataforma, confira a prévia, selecione a aula e use **Revisar perguntas e salvar rascunho**.
7. Edite as perguntas/gabaritos e clique em **Salvar rascunho**. A avaliação permanece privada até a publicação pelo professor.

O exportador está em `public/exportar-google-forms.gs`. Usa o formulário atual, com a anotação `@OnlyCurrentDoc`; não busca respostas de alunos, não altera o formulário e não envia dados a serviços externos. O download contém perguntas e gabaritos disponíveis, portanto deve ser usado pelo responsável pela avaliação.

Se já instalou uma versão anterior, substitua a função `exportarParaAprender` pelo código atualizado, preservando os outros scripts do formulário. Evite manter duas funções com esse nome em arquivos diferentes. A versão 2 não consulta feedback/navegação dos itens e trata falhas na leitura de pontuação/gabarito como avisos na prévia, sem inventar respostas corretas.

Também é aceito o JSON estrutural retornado pela API oficial do Google Forms (`info` e `items`). Planilhas/CSV de respostas e links de formulário não são arquivos de importação.

## Conversões e revisão

- Múltipla escolha e lista suspensa com até 20 opções compatíveis viram múltipla escolha. Se houver um único gabarito inequívoco, ele é preservado. Sem gabarito, o professor deve selecionar a alternativa correta antes de salvar; nenhuma é escolhida automaticamente.
- Resposta curta com respostas corretas no JSON da API vira resposta curta. A correção local ignora maiúsculas/espaços extras e considera acentuação.
- O exportador nativo não obtém gabaritos de texto curto pelo serviço Forms do Apps Script. Textos sem gabarito e parágrafos ficam como discursivas de correção manual.
- Caixas de seleção, opção Outro e listas fora dos limites são adaptadas para discursivas, com as alternativas preservadas no enunciado. Gabaritos não são colocados no enunciado.
- Grades são separadas em uma pergunta por linha. Confira pontuação e gabaritos, especialmente quando o exportador não disponibilizar esses dados.
- Questões de arquivo usam o limite local de 5 MB e os formatos PDF, PNG, JPEG e TXT. Respostas e arquivos já enviados ao Google não são importados.
- Datas, horas, escalas, avaliações por ícones e outros tipos ficam como discursivas para revisão manual.
- Imagens, vídeos, feedback automático, desvios entre seções, obrigatoriedade e ordem aleatória exigem adaptação. Os avisos da prévia explicam o que foi alterado ou não importado. Imagens necessárias podem ser anexadas pelo professor após salvar o rascunho.
- Pontuação ausente, zero ou fora do intervalo local recebe 1 ponto para revisão. O sistema aceita de 0,01 a 100 pontos por questão. A pontuação final deve ser conferida antes da publicação.

Até 100 perguntas após separar as grades; arquivo JSON de até 5 MB. Conteúdo convertido limitado para caber no formulário de avaliação existente. Formulários maiores devem ser divididos; o importador não salva apenas uma parte silenciosamente.

## Validação e acesso

A prévia não grava uma avaliação. A API verifica sessão, instituição e responsabilidade pela turma. Apenas administradores e professores autorizados podem importar. A gravação usa a API existente de criação de avaliações, com publicação desativada por padrão.

Testes locais cobrem conversão, ausência/ambiguidade de gabarito, notas, grades, adaptações, limites, descarte de respostas de alunos e o exportador com simulação das APIs do Google. O exportador foi conferido com a documentação oficial; não houve execução em uma conta Google real nesta implementação, pois nenhum formulário/autorização Google foi fornecido.

Referências: [estrutura da API Forms](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms), [serviço Forms e interface do formulário](https://developers.google.com/apps-script/reference/forms/form-app), [scripts vinculados](https://developers.google.com/apps-script/guides/bound) e [itens do formulário](https://developers.google.com/apps-script/reference/forms/item).
