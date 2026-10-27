import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { importGoogleForm } from '../src/lib/google-forms-import.ts';
import { assessmentSchema, automaticScores } from '../src/lib/assessments.ts';

const form = items => ({ info: { title: 'Formulário de informática', description: 'Leia as perguntas.' }, items });
const item = (question, title = 'Qual alternativa está correta?') => ({ title, questionItem: { question } });
const single = (keys = ['Windows']) => ({ required: true, grading: { pointValue: 2, correctAnswers: { answers: keys.map(value => ({ value })) } }, choiceQuestion: { type: 'RADIO', options: [{ value: 'Windows' }, { value: 'Teclado' }] } });

test('converte questões, opções e gabarito sem copiar respostas de alunos', () => {
  const source = form([item(single()), item({ grading: { pointValue: 3, correctAnswers: { answers: [{ value: 'teclado' }, { value: 'keyboard' }] } }, textQuestion: {} }, 'Como digitamos?'), item({ grading: { pointValue: 4 }, textQuestion: { paragraph: true } }, 'Explique a diferença.')]);
  source.responses = [{ email: 'dados-privados-nao-importados@example.com' }];
  const imported = importGoogleForm(source);
  assert.deepEqual(imported.questions.map(q => q.type), ['MULTIPLE_CHOICE', 'SHORT', 'ESSAY']);
  assert.equal(imported.questions[0].answerKey, '0');
  assert.deepEqual(imported.questions[1].answerKey, ['teclado', 'keyboard']);
  assert.equal(imported.needsAnswerKey, 0);
  assert(!JSON.stringify(imported).includes('dados-privados'));
  const definition = assessmentSchema.parse({ ...imported, lessonId: 'aula', kind: 'TEST', maxAttempts: 1 });
  assert.deepEqual(automaticScores(definition.questions, { [imported.questions[0].id]: '0', [imported.questions[1].id]: ' KEYBOARD ' }), { [imported.questions[0].id]: 2, [imported.questions[1].id]: 3 });
});

test('não inventa gabarito para alternativa ausente ou ambígua', () => {
  for (const question of [single([]), single(['Windows', 'Teclado']), { ...single(), choiceQuestion: { type: 'RADIO', options: [{ value: 'Windows' }, { value: 'Windows' }] } }]) {
    const imported = importGoogleForm(form([item(question)]));
    assert.equal(imported.questions[0].answerKey, null);
    assert.equal(imported.needsAnswerKey, 1);
    assert(imported.warnings.some(warning => warning.includes('selecione a alternativa correta')));
    assert(!assessmentSchema.safeParse({ ...imported, lessonId: 'aula', kind: 'TEST', maxAttempts: 1 }).success);
  }
});

test('adapta marcação múltipla manualmente sem colocar gabaritos no enunciado', () => {
  const q = { ...single(['RESPOSTA PRIVADA']), choiceQuestion: { type: 'CHECKBOX', options: [{ value: 'Opção A' }, { value: 'Opção B' }] } };
  const imported = importGoogleForm(form([item(q)]));
  assert.equal(imported.questions[0].type, 'ESSAY');
  assert(imported.questions[0].prompt.includes('Opção A'));
  assert(!imported.questions[0].prompt.includes('RESPOSTA PRIVADA'));
  assert.equal(imported.questions[0].answerKey, null);
  assert(imported.warnings.some(warning => warning.includes('correção manual')));
});

test('separa grades, preserva contexto e sinaliza mídias, anexos e obrigatoriedade', () => {
  const imported = importGoogleForm(form([
    { title: 'Seção de dispositivos', description: 'Observe as funções.', pageBreakItem: {} },
    { title: 'Relacione cada dispositivo', questionGroupItem: { questions: [{ rowQuestion: { title: 'Mouse' } }, { rowQuestion: { title: 'Monitor' } }], grid: { columns: { type: 'RADIO', options: [{ value: 'Exibir' }, { value: 'Apontar' }] } }, image: { sourceUri: 'http://127.0.0.1/nao-buscar' } } },
    item({ required: true, fileUploadQuestion: {} }, 'Envie o arquivo.'),
    { title: 'Vídeo de contexto', videoItem: {} },
  ]));
  assert.equal(imported.questions.length, 3);
  assert(imported.questions[0].prompt.includes('Seção de dispositivos'));
  assert(imported.questions[1].prompt.includes('Monitor'));
  assert.equal(imported.questions[2].type, 'FILE');
  assert.equal(imported.needsAnswerKey, 2);
  assert(imported.warnings.some(warning => warning.includes('Mídia')));
  assert(imported.warnings.some(warning => warning.includes('obrigatoriedade')));
});

test('normaliza quebras de linha nas opções sem mudar o índice do gabarito', () => {
  const imported = importGoogleForm(form([item({ ...single(['Sistema\noperacional']), choiceQuestion: { type: 'DROP_DOWN', options: [{ value: 'Teclado' }, { value: 'Sistema\noperacional' }] } })]));
  assert.equal(imported.questions[0].answerKey, '1');
  assert.deepEqual(imported.questions[0].options, ['Teclado', 'Sistema operacional']);
});

test('rejeita formato incorreto, excesso de questões e perguntas grandes sem salvar parte', () => {
  assert.throws(() => importGoogleForm({ responses: [] }), /JSON do formulário/);
  assert.throws(() => importGoogleForm(form([])), /não contém perguntas/);
  assert.throws(() => importGoogleForm(form(Array.from({ length: 101 }, () => item(single())))), /100 questões/);
  assert.throws(() => importGoogleForm(form([item(single(), 'x'.repeat(5001))])), /5.000 caracteres/);
  const source = form([item(single())]);
  assert.notEqual(importGoogleForm(source).questions[0].id, importGoogleForm(source).questions[0].id);
});

test('exportador gera JSON compatível usando só o formulário atual e download seguro', () => {
  const script = readFileSync(new URL('../public/exportar-google-forms.gs', import.meta.url), 'utf8');
  let exported, dialog;
  const unsupported = () => { throw new Error('Este tipo de pergunta não é compatível com a operação especificada.'); };
  const typed = { isRequired: () => true, getPoints: () => 2, getFeedbackForCorrect: unsupported, getFeedbackForIncorrect: unsupported, getGeneralFeedback: unsupported, getChoices: () => [{ getValue: () => 'A', isCorrectAnswer: () => true, getPageNavigationType: unsupported }, { getValue: () => 'B', isCorrectAnswer: () => false, getPageNavigationType: unsupported }], hasOtherOption: () => false };
  const sourceItem = { getType: () => 'MULTIPLE_CHOICE', getTitle: () => 'Pergunta com </script> no texto', getHelpText: () => '', asMultipleChoiceItem: () => typed };
  runInNewContext(`${script}\nexportarParaAprender();`, {
    FormApp: { getActiveForm: () => ({ getTitle: () => 'Formulário exportado', getDescription: () => '', isQuiz: () => true, getItems: () => [sourceItem] }), getUi: () => ({ showModalDialog: value => { dialog = value.html; } }) },
    Utilities: { newBlob: value => { exported = JSON.parse(value); return { getBytes: () => Buffer.from(value) }; }, base64Encode: value => Buffer.from(value).toString('base64') },
    HtmlService: { createHtmlOutput: html => ({ html, setWidth() { return this; }, setHeight() { return this; } }) },
  });
  assert.equal(importGoogleForm(exported).questions[0].answerKey, '0');
  assert(dialog.includes('download="google-forms-aprender.json"'));
  assert(!dialog.includes('</script>'));
  assert(!script.includes('getResponses('));
  assert(!script.includes('UrlFetchApp'));
});

test('falha de pontuação ou gabarito gera aviso sem interromper ou adivinhar a resposta', () => {
  const script = readFileSync(new URL('../public/exportar-google-forms.gs', import.meta.url), 'utf8');
  const unsupported = () => { throw new Error('Este tipo de pergunta não é compatível com a operação especificada.'); };
  let exported;
  const typed = { isRequired: () => true, getPoints: unsupported, getFeedbackForCorrect: unsupported, getGeneralFeedback: unsupported, getChoices: () => [{ getValue: () => 'A', isCorrectAnswer: () => true }, { getValue: () => 'B', isCorrectAnswer: unsupported }], hasOtherOption: () => false };
  const sourceItem = { getType: () => 'MULTIPLE_CHOICE', getTitle: () => 'Pergunta com metadados incompatíveis', getHelpText: () => '', asMultipleChoiceItem: () => typed };
  runInNewContext(`${script}\nexportarParaAprender();`, {
    FormApp: { getActiveForm: () => ({ getTitle: () => 'Teste de compatibilidade', getDescription: () => '', isQuiz: () => true, getItems: () => [sourceItem] }), getUi: () => ({ showModalDialog() {} }) },
    Utilities: { newBlob: value => { exported = JSON.parse(value); return { getBytes: () => Buffer.from(value) }; }, base64Encode: value => Buffer.from(value).toString('base64') },
    HtmlService: { createHtmlOutput: html => ({ html, setWidth() { return this; }, setHeight() { return this; } }) },
  });
  const preview = importGoogleForm(exported);
  assert.equal(preview.questions.length, 1);
  assert.equal(preview.questions[0].points, 1);
  assert.equal(preview.questions[0].answerKey, null);
  assert.equal(preview.needsAnswerKey, 1);
  assert(preview.warnings.some(warning => warning.includes('não foi possível ler pontuação')));
  assert(preview.warnings.some(warning => warning.includes('não foi possível ler gabarito')));
});
