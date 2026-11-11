import assert from 'node:assert/strict';
import { importQuestionsJson, questionsJsonExample } from '../src/lib/questions-json';

const parsed = importQuestionsJson(questionsJsonExample);
assert.equal(parsed.questions[0].answerKey, '1');
assert.equal(parsed.questions[1].answerKey, 'true');
assert.equal(parsed.kind, 'ACTIVITY');
assert.equal(new Set(parsed.questions.map(question => question.id)).size, 4);
const eight = importQuestionsJson({ ...questionsJsonExample, tipo: 'prova', questoes: [
  ...questionsJsonExample.questoes,
  { tipo: 'lacunas', enunciado: 'O [___] permite digitar.', respostas_aceitas: ['teclado'] },
  { tipo: 'associacao', enunciado: 'Associe os dispositivos.', alternativas: ['Mouse', 'Monitor'], correspondencias: ['Exibir', 'Apontar'], resposta_correta: [2, 1] },
  { tipo: 'arquivo', enunciado: 'Envie o arquivo da atividade.' },
  { tipo: 'pratica', enunciado: 'Explique o procedimento realizado.' },
] });
assert.equal(eight.questions.length, 8); assert.equal(eight.kind, 'TEST');
assert.deepEqual(eight.questions[5].answerKey, ['1', '0']);
for (const source of [null, [], {}, { titulo: 'Teste', questoes: [] }, { titulo: 'Teste', questoes: [{ tipo: 'multipla_escolha', enunciado: 'Qual resposta?', alternativas: ['A', 'B'], resposta_correta: 0 }] }, { titulo: 'Teste', questoes: [{ tipo: 'multipla_escolha', enunciado: 'Qual resposta?', alternativas: ['A', 'B'], resposta_correta: 3 }] }, { titulo: 'Teste', questoes: [{ tipo: 'verdadeiro_falso', enunciado: 'Isso é verdadeiro?', resposta_correta: 'true' }] }, { titulo: 'Teste', questoes: [{ tipo: 'lacunas', enunciado: 'Sem lacunas.', respostas_aceitas: ['resposta'] }] }, { ...questionsJsonExample, documentId: 'injetar' }, { ...questionsJsonExample, questoes: Array.from({ length: 101 }, () => questionsJsonExample.questoes[0]) }]) assert.throws(() => importQuestionsJson(source));
console.log('PASS JSON: oito tipos, índices iniciados em 1, UUIDs, validação de limites e rejeição de formatos/gabaritos inválidos.');
