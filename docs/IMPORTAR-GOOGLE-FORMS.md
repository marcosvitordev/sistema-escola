# Importar avaliações do Google Forms

Abra **Turma → Provas e atividades → Importar Google Forms**. A turma precisa ter uma aula para receber a avaliação. A importação aceita ZIP com imagens ou JSON e não exige credenciais Google no servidor. Importação direta por link/OAuth não está configurada.

## Exportar seu formulário

1. Abra o formulário no Google Forms em modo de edição.
2. No menu de três pontos, abra **Editor de scripts**.
3. Na tela de importação do Aprender, abra **Como exportar meu formulário do Google?** e copie ou baixe o exportador. Cole o código ao final dos scripts existentes, sem removê-los.
4. Salve e execute `exportarParaAprender`. Autorize na sua própria conta Google.
5. Retorne à aba do formulário e use **Baixar arquivo para importar** na janela do exportador.
6. Envie o ZIP completo na plataforma, sem extrair. Formulários sem imagens podem gerar JSON. Confira a prévia, as associações das imagens, selecione a aula e use **Revisar perguntas e salvar rascunho**.
7. Edite as perguntas/gabaritos e clique em **Salvar rascunho**. A avaliação permanece privada até a publicação pelo professor.

O exportador está em `public/exportar-google-forms.gs`. Usa o formulário atual, não busca respostas de alunos e não altera o formulário. O download contém perguntas, imagens e gabaritos disponíveis, portanto deve ser usado pelo responsável pela avaliação. A função completa consulta a API e baixa as imagens do próprio Google; o token não vai para o ZIP nem para a plataforma.

Se já instalou uma versão anterior, substitua todo o exportador e seus auxiliares pelo código v3, preservando os outros scripts do formulário. Evite funções duplicadas em arquivos diferentes. Reexporte o formulário: o JSON antigo não contém os arquivos de imagem. A leitura opcional de pontuação/gabarito continua protegida contra operações incompatíveis e não inventa respostas corretas.

## Imagens dentro de perguntas e alternativas

A função simples `exportarParaAprender` inclui imagens separadas do formulário. O serviço nativo do Apps Script não fornece as imagens incorporadas às perguntas e alternativas; para elas, use `exportarParaAprenderComImagens`:

1. Crie ou selecione um projeto no Google Cloud, ative a **Google Forms API** e configure a tela de consentimento para sua conta.
2. Nas configurações do projeto Apps Script vinculado ao formulário, associe o número desse projeto Cloud e habilite a exibição do arquivo `appsscript.json`.
3. Mescle os escopos de `public/google-forms-appsscript.json` ao manifesto existente, preservando as demais configurações. A tela de importação oferece o download do exemplo e o guia oficial.
4. Execute `exportarParaAprenderComImagens`, autorize na própria conta Google e baixe o ZIP.
5. Importe o ZIP inteiro. Na prévia, confira os destinos das imagens; imagens separadas são associadas inicialmente à próxima pergunta, ou à última quando estiverem no fim. É possível mudar a associação ou excluir uma imagem da importação.

Essa configuração pertence à conta Google do proprietário; não foi executada automaticamente na VPS. O exportador copia os bytes das imagens imediatamente, pois os endereços `contentUri` do Google são temporários. A plataforma não depende desses endereços depois da importação. Falhas ao baixar ou converter uma imagem aparecem nos avisos.

As imagens são exibidas com legendas junto à pergunta; as legendas identificam imagens das alternativas. A revisão permite conferir sua correspondência antes de publicar. Vídeos não são importados.

Também é aceito o JSON estrutural retornado pela API oficial do Google Forms (`info` e `items`). Planilhas/CSV de respostas e links de formulário não são arquivos de importação.

## Conversões e revisão

- Múltipla escolha e lista suspensa com até 20 opções compatíveis viram múltipla escolha. Se houver um único gabarito inequívoco, ele é preservado. Sem gabarito, o professor deve selecionar a alternativa correta antes de salvar; nenhuma é escolhida automaticamente.
- Resposta curta com respostas corretas no JSON da API vira resposta curta. A correção local ignora maiúsculas/espaços extras e considera acentuação.
- O exportador nativo não obtém gabaritos de texto curto pelo serviço Forms do Apps Script. Textos sem gabarito e parágrafos ficam como discursivas de correção manual.
- Caixas de seleção, opção Outro e listas fora dos limites são adaptadas para discursivas, com as alternativas preservadas no enunciado. Gabaritos não são colocados no enunciado.
- Grades são separadas em uma pergunta por linha. Confira pontuação e gabaritos, especialmente quando o exportador não disponibilizar esses dados.
- Questões de arquivo usam o limite local de 5 MB e os formatos PDF, PNG, JPEG e TXT. Respostas e arquivos já enviados ao Google não são importados.
- Datas, horas, escalas, avaliações por ícones e outros tipos ficam como discursivas para revisão manual.
- Vídeos, feedback automático, desvios entre seções, obrigatoriedade e ordem aleatória exigem adaptação. Os avisos da prévia explicam o que foi alterado ou não importado. Imagens exigem o ZIP do exportador v3; arquivos JSON com apenas links não incluem os bytes das imagens.
- Pontuação ausente, zero ou fora do intervalo local recebe 1 ponto para revisão. O sistema aceita de 0,01 a 100 pontos por questão. A pontuação final deve ser conferida antes da publicação.

Até 100 perguntas após separar as grades; JSON de até 5 MB ou ZIP de até 30 MB. Cada imagem PNG/JPEG aceita até 5 MB; até 25 imagens por pergunta. O exportador limita as imagens a 200 arquivos únicos e 20 MB no total. O leitor limita a expansão do ZIP a 50 MB, valida caminhos, manifesto e assinaturas e não aceita SVG. Conteúdo convertido limitado para caber no formulário de avaliação existente. Formulários maiores devem ser divididos; o importador não salva apenas uma parte silenciosamente.

## Validação e acesso

A prévia não grava uma avaliação. A API verifica sessão, instituição e responsabilidade pela turma. Apenas administradores e professores autorizados podem importar. A gravação usa a API existente de criação de avaliações, com publicação desativada por padrão.

O ZIP é aberto no navegador; as imagens seguem em envios individuais para a API autenticada e ficam privadas no banco. Se um envio falhar, o rascunho é preservado e **Salvar rascunho** permite tentar de novo sem duplicar a avaliação ou as imagens já recebidas. A cópia de avaliações preserva todas as imagens. Depois que um aluno inicia uma tentativa, não é permitido alterar as imagens.

Testes locais cobrem conversão, ausência/ambiguidade de gabarito, notas, grades, adaptações, limites, descarte de respostas de alunos e o exportador com simulação das APIs do Google. O exportador foi conferido com a documentação oficial; não houve execução em uma conta Google real nesta implementação, pois nenhum formulário/autorização Google foi fornecido.

Referências: [estrutura da API Forms](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms), [configuração da API no Apps Script](https://developers.google.com/workspace/forms/api/guides/apps-script-setup), [diferenças entre os serviços](https://developers.google.com/workspace/forms/api/guides/compare-rest-apps-script), [serviço Forms](https://developers.google.com/apps-script/reference/forms/form-app) e [imagens separadas](https://developers.google.com/apps-script/reference/forms/image-item).
