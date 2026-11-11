# Importar questões em JSON

No PDF, role até **Questões da apostila → Importar questões JSON**. Outra opção é **Turma → Provas e atividades → Importar questões JSON**, escolhendo a aula e, opcionalmente, a apostila. Envie um arquivo `.json` ou cole o conteúdo, use **Validar e ver prévia** e **Importar como rascunho**. Revise o gabarito e clique em **Publicar avaliação**. A aula também deve estar publicada.

O formulário aparece abaixo do PDF para o aluno responder e entregar na mesma tela. Sem questões publicadas vinculadas, o aluno não vê essa seção. As respostas têm salvamento automático, tentativas e correção iguais às outras atividades. A entrega das questões é separada da entrega da apostila. Os gabaritos só aparecem para o aluno após a liberação das notas pelo professor. Questões também ficam acessíveis em Provas e atividades.

O sistema oferece **Baixar modelo JSON**, **Preencher com exemplo** e **Como o JSON deve ficar?**. Arquivos devem usar UTF-8, ter até 300 KB e conter de 1 a 100 questões. Não use comentários nem vírgulas após o último campo. Números e booleanos não usam aspas. Campos desconhecidos são rejeitados para evitar importar um formato incorreto silenciosamente.

Exemplo com todos os tipos aceitos:

```json
{
  "titulo": "Atividade de informática",
  "tipo": "atividade",
  "instrucoes": "Leia a apostila e responda às questões.",
  "tentativas": 1,
  "questoes": [
    {
      "tipo": "multipla_escolha",
      "enunciado": "Qual dispositivo usamos para digitar?",
      "pontos": 1,
      "alternativas": ["Monitor", "Teclado", "Mouse"],
      "resposta_correta": 2
    },
    {
      "tipo": "verdadeiro_falso",
      "enunciado": "O mouse é um dispositivo de entrada.",
      "pontos": 1,
      "resposta_correta": true
    },
    {
      "tipo": "resposta_curta",
      "enunciado": "Qual dispositivo mostra as imagens?",
      "pontos": 1,
      "respostas_aceitas": ["monitor", "tela"]
    },
    {
      "tipo": "discursiva",
      "enunciado": "Explique o que é um sistema operacional.",
      "pontos": 2
    },
    {
      "tipo": "lacunas",
      "enunciado": "O [___] permite digitar e o [___] exibe imagens.",
      "pontos": 1,
      "respostas_aceitas": ["teclado", "monitor"]
    },
    {
      "tipo": "associacao",
      "enunciado": "Associe cada dispositivo à função.",
      "pontos": 1,
      "alternativas": ["Mouse", "Monitor"],
      "correspondencias": ["Exibir imagens", "Apontar e clicar"],
      "resposta_correta": [2, 1]
    },
    {
      "tipo": "arquivo",
      "enunciado": "Envie o arquivo do exercício realizado.",
      "pontos": 1
    },
    {
      "tipo": "pratica",
      "enunciado": "Crie uma pasta e descreva como fez.",
      "pontos": 1
    }
  ]
}
```

| Campo | Regra |
| --- | --- |
| `titulo` | Obrigatório, de 3 a 150 caracteres. |
| `tipo` geral | `atividade` (padrão) ou `prova`. |
| `instrucoes` | Opcional, até 5.000 caracteres. |
| `tentativas` | Opcional, número inteiro de 1 a 10; padrão 1. |
| `prazo` | Opcional: `null` ou data ISO com fuso, por exemplo `2026-12-01T18:00:00-05:00`. |
| `questoes` | Lista obrigatória com 1 a 100 itens. |
| `enunciado` | Obrigatório em cada questão, de 3 a 5.000 caracteres. |
| `pontos` | Opcional em cada questão, número maior que zero e até 100; padrão 1. Use ponto em decimais. |
| `resposta_correta` | Na múltipla escolha, número da alternativa **começando em 1**. Em verdadeiro/falso, `true` ou `false`. Na associação, lista de posições da segunda coluna, começando em 1, sem repetições. |
| `respostas_aceitas` | Na resposta curta, alternativas textuais aceitas. Em lacunas, uma resposta para cada `[___]`, na mesma ordem. |

Discursiva, arquivo e prática têm correção manual e não recebem gabarito no JSON. Imagens podem ser adicionadas após a importação pela edição da avaliação; não são importadas por esse formato.

A publicação das questões é independente da liberação das páginas do PDF. Excluir uma avaliação remove as questões e respectivas tentativas. Excluir apenas o PDF preserva a avaliação e suas respostas na área de Provas e atividades da turma.

## Implementação e validação

Migração aditiva `20261112020000_pdf_questions`: vínculo opcional `Assessment.documentId`, índice de documento/publicação e FK com `ON DELETE SET NULL`. Avaliações antigas permanecem sem vínculo. A API verifica instituição, responsável, aula e apostila, valida todo o JSON antes de criar os registros e grava a importação em uma transação com auditoria.

`tests/questions-json.unit.ts` verifica oito tipos, conversão dos gabaritos iniciados em 1, limites e formatos inválidos. `tests/pdf-questions.spec.ts` verifica importação por arquivo, prévia, publicação, isolamento, ocultação de gabaritos, formulário abaixo do PDF, resposta/entrega/correção, duplicação e preservação das avaliações ao remover um PDF.
