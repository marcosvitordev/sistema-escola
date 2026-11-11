'use client';
import { useEffect, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { importQuestionsJson, questionsJsonExample } from '@/lib/questions-json';
import { questionTypes } from '@/lib/assessments';
import type { LessonChoice } from '@/lib/assessment-types';
import { assessmentRequest } from './assessment-api';

type PdfChoice = { id: string; title: string; lessonId: string };
export function JsonQuestionsImport({ documentId, classId, lessons = [], onSaved, onCancel }: { documentId?: string; classId?: string; lessons?: LessonChoice[]; onSaved: (id: string, documentId?: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [lessonId, setLessonId] = useState(lessons[0]?.id || '');
  const [pdfId, setPdfId] = useState('');
  const [documents, setDocuments] = useState<PdfChoice[]>([]);
  const [preview, setPreview] = useState<ReturnType<typeof importQuestionsJson> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!classId) return;
    let active = true;
    assessmentRequest<{ documents: PdfChoice[] }>(`classes/${classId}/documents`).then(data => { if (active) setDocuments(data.documents); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [classId]);
  function change(value: string) { setCode(value); setPreview(null); setError(''); }
  function parse() {
    if (new TextEncoder().encode(code).byteLength > 300_000) throw new Error('Use um JSON de até 300 KB.');
    let source: unknown;
    try { source = JSON.parse(code.replace(/^\uFEFF/, '')); } catch { throw new Error('JSON inválido. Confira aspas, vírgulas e colchetes.'); }
    return { source, result: importQuestionsJson(source) };
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const { source } = parse();
      if (!documentId && !lessonId) throw new Error('Selecione a aula.');
      const item = await assessmentRequest<{ id: string }>(documentId ? `documents/${documentId}/import-json` : `classes/${classId}/import-json`, { source, ...(!documentId ? { lessonId, documentId: pdfId || null } : {}) });
      onSaved(item.id, documentId || pdfId || undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível importar.'); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(questionsJsonExample, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'modelo-questoes.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="card json-questions-import" aria-label="Importar questões em JSON"><h2>Importar questões em JSON</h2><p>Selecione um arquivo ou cole o JSON. Confira a prévia e importe como rascunho. Depois revise e publique para os alunos.</p>
    <div className="assessment-actions"><button type="button" className="secondary" disabled={busy} onClick={download}><Download size={17} />Baixar modelo JSON</button><button type="button" className="secondary" disabled={busy} onClick={() => { if (!code.trim() || confirm('Substituir o JSON digitado pelo modelo de exemplo?')) change(JSON.stringify(questionsJsonExample, null, 2)); }}>Preencher com exemplo</button><label className="upload-label"><FileUp size={17} />Selecionar arquivo JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setPreview(null); if (!file.name.toLowerCase().endsWith('.json') || file.size > 300_000) { setError('Selecione um arquivo .json de até 300 KB.'); return; } try { change(await file.text()); } catch { setError('Não foi possível ler este arquivo.'); } }} /></label></div>
    <details className="json-format-help"><summary>Como o JSON deve ficar?</summary><p>Use <code>titulo</code> e uma lista <code>questoes</code>. Cada questão precisa de <code>tipo</code> e <code>enunciado</code>. <code>pontos</code> vale 1 quando omitido.</p><p>Na múltipla escolha, <code>resposta_correta</code> é o número da alternativa, começando em <strong>1</strong>. Verdadeiro/falso usa <code>true</code> ou <code>false</code>, sem aspas. Resposta curta usa a lista <code>respostas_aceitas</code>.</p><p>Tipos aceitos: <code>multipla_escolha</code>, <code>verdadeiro_falso</code>, <code>resposta_curta</code>, <code>discursiva</code>, <code>lacunas</code>, <code>associacao</code>, <code>arquivo</code> e <code>pratica</code>. Nas lacunas, escreva <code>[___]</code> no enunciado. Na associação, use <code>alternativas</code>, <code>correspondencias</code> e uma lista numérica em <code>resposta_correta</code>, começando em 1.</p><p>Até 100 questões. Campos opcionais: <code>tipo</code> geral (atividade ou prova), <code>instrucoes</code>, <code>tentativas</code> (1 a 10) e <code>prazo</code> (ex.: 2026-12-01T18:00:00-05:00).</p><pre>{JSON.stringify(questionsJsonExample, null, 2)}</pre></details>
    {!documentId && <div className="assessment-form-grid"><label>Aula das questões<select disabled={busy} value={lessonId} onChange={event => { setLessonId(event.target.value); setPdfId(''); }}>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label><label>Apostila vinculada<select disabled={busy} value={pdfId} onChange={event => setPdfId(event.target.value)}><option value="">Sem vínculo com PDF</option>{documents.filter(document => document.lessonId === lessonId).map(document => <option value={document.id} key={document.id}>{document.title}</option>)}</select></label></div>}
    <label>JSON das questões<textarea disabled={busy} spellCheck={false} rows={12} value={code} maxLength={300_000} onChange={event => change(event.target.value)} placeholder='{"titulo":"Minha atividade","questoes":[...]}' /></label>
    <p className="help">{documentId || pdfId ? 'As questões aparecerão abaixo deste PDF quando a avaliação for publicada. A publicação das questões é independente da liberação das páginas.' : 'Sem vínculo com PDF, a avaliação fica em Provas e atividades da turma.'}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <section className="json-preview"><h3>{preview.title}</h3><p>{preview.questions.length} questões · {preview.questions.reduce((sum, question) => sum + question.points, 0)} pontos</p><ol>{preview.questions.map(question => <li key={question.id}><strong>{question.prompt}</strong><small>{questionTypes[question.type]} · {question.points} ponto(s)</small></li>)}</ol></section>}
    <div className="assessment-actions"><button type="button" disabled={busy || !code.trim()} onClick={() => { try { setPreview(parse().result); setError(''); } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Confira o JSON.'); } }}>Validar e ver prévia</button>{preview && <button type="button" disabled={busy} onClick={save}>{busy ? 'Importando…' : 'Importar como rascunho'}</button>}<button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar importação</button></div>
  </section>;
}
