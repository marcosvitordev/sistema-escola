# Arquitetura proposta

## Decisões

Monólito modular em Next.js: páginas React e API REST no mesmo serviço, com PostgreSQL/Prisma. Isso reduz custo operacional inicial e permite separar a API no futuro. Autenticação por usuário/matrícula, sem exigir e-mail pessoal. Sessões opacas revogáveis no banco, sem dados de autorização controlados pelo cliente.

O PostgreSQL pode ser local ou hospedado no Supabase. A implementação inicial guarda PDFs privados no PostgreSQL (`bytea`, até 3 MB). A migração dos originais para armazenamento de objetos está prevista para escala; nenhum bucket público será necessário. Todas as autorizações são verificadas antes de transmitir documentos. A escolha de CSS simples nesta fundação evita dependências adicionais; Tailwind/shadcn podem ser incorporados com a evolução dos componentes.

## Modelo implementado

```mermaid
erDiagram
    Institution ||--o{ User : possui
    Institution ||--o{ Course : oferece
    Course ||--o{ Class : organiza
    User ||--o{ Class : leciona
    Class ||--o{ Enrollment : recebe
    User ||--o{ Enrollment : participa
    User ||--o{ Session : autentica
```

- Institution: nome e código único de acesso.
- User: instituição, nome, usuário único na instituição, hash, perfil, situação e troca de senha obrigatória.
- Course: instituição, nome e descrição.
- Class: curso, professor responsável e nome.
- Enrollment: turma e aluno, combinação única.
- Session: hash do token, usuário e expiração.
- AuditLog: instituição, ator, operação, recurso e data.
- LoginAttempt: contador persistido e janela de bloqueio, sem armazenar senha.
- Lesson: turma, módulo textual, título, descrição, data prevista e publicação.
- PdfDocument: aula, título, bytes originais imutáveis, hash e número de páginas.
- PdfWork: aluno/documento únicos, anotações JSON, revisão, última edição e entrega.
- PdfRevision: snapshots de anotações, com retenção aproximada das 20 últimas revisões.
- PdfFeedback: histórico de comentários, notas e responsável pela correção.
- Assessment: aula, formato (prova/atividade), instruções, publicação, prazo, limite de tentativas, liberação de notas e revisão da definição.
- AssessmentQuestion: ordem única por avaliação, tipo, enunciado, pontuação, alternativas/colunas, gabarito protegido e imagem opcional.
- AssessmentAttempt: aluno/avaliação/número únicos, respostas, revisão otimista, entrega, pontuação automática, correção manual e feedback. A API omite notas ainda não liberadas.
- AssessmentFile: arquivo privado da questão ou da resposta, vinculado à avaliação, à questão e, quando enviado por aluno, à tentativa individual.

Os vínculos entre instituições são validados na API. As chaves estrangeiras preservam a integridade relacional; a API também impede vincular aluno ou professor de outra instituição.

## Modelo das fases seguintes

- Course → Class → Module → Lesson. Publicação e prazos por aula.
- Material → Document → DocumentVersion: PDF original imutável, chave privada de armazenamento, hash, tamanho e versão.
- DocumentWork: aluno, documento/versão, estado (não iniciado/em andamento/entregue), revisão inteira e última edição. Chave única aluno/documento.
- Annotation: trabalho, página, ferramenta, conteúdo, cor, fonte e coordenadas relativas às dimensões originais da página.
- SaveRevision: histórico limitado de revisões para recuperação e comparação.
- Evolução de avaliações: banco independente de questões, rubricas avançadas, relatórios e estatísticas históricas. Na primeira implementação, alternativas/gabaritos e respostas/revisões são JSON/arrays validados; as entidades de avaliação, questão, tentativa e arquivo são relacionais.

## Contrato do editor PDF

PDF.js renderiza as páginas e uma camada independente mostra as anotações. Posições e tamanhos são frações normalizadas das dimensões visíveis da página, nunca pixels da janela. Tamanho da fonte é armazenado em pontos. A exportação com pdf-lib transforma essas coordenadas, inclusive rotação e recorte da página. O arquivo original é preservado. O texto usa quebras explícitas de linha, sem depender de quebra automática variável entre navegadores.

Autosave após pausa curta, com número de revisão e atualização condicional transacional no banco. HTTP 409 ao receber revisão antiga: preservar o rascunho e pedir resolução, sem sobrescrever silenciosamente. A primeira implementação usa localStorage para rascunho vinculado a usuário/documento/aba e revisão de origem; IndexedDB está previsto para maior capacidade e uso offline completo. Sincronização ao reconectar e avisos de estado acessíveis. Dados de alunos diferentes têm chaves e autorização independentes no servidor. Entregas congelam a revisão até reabertura autorizada.

## Organização das etapas

1. Fundação: arquitetura, projeto, banco, login, permissões e cadastros de instituição, usuários, cursos, turmas e matrículas.
2. Prioridade: upload privado, PDF.js, texto sobre páginas, autosave/reabertura, revisão pelo professor e exportação. Testes com três páginas, zoom, conexão interrompida, conflitos e acessos indevidos.
3. Avaliações: questões objetivas e discursivas, tentativas, correção determinística sem IA, feedback e liberação de notas.
4. Acompanhamento: entregas, filtros, indicadores reais e relatórios PDF/Excel.
5. Qualidade: acessibilidade, testes de permissões e carga, retenção, backup, documentação e implantação.

Certificados, frequência, tela compartilhada, gamificação e uso offline completo ficam fora da primeira versão. O rascunho offline do PDF faz parte da Fase 2.

## Referências consultadas

- [Autenticação no Next.js](https://nextjs.org/docs/app/guides/authentication)
- [Conexão PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
