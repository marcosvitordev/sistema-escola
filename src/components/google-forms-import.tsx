'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ClipboardCopy, Download, FileUp, Import } from 'lucide-react';
import type { GoogleFormsPreview } from '@/lib/google-forms-import';
import type { LessonChoice } from '@/lib/assessment-types';
import { questionTypes } from '@/lib/assessments';
import { AssessmentBuilder } from './assessment-builder';

export function GoogleFormsImport({ classId, lessons, onCancel, onSaved }: { classId: string; lessons: LessonChoice[]; onCancel: () => void; onSaved: (id: string) => void }) {
  const [lessonId, setLessonId] = useState(lessons[0]?.id || '');
  const [preview, setPreview] = useState<GoogleFormsPreview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.value = ''; setPreview(null); setReviewing(false); setError('');
    if (!file.name.toLowerCase().endsWith('.json')) { setError('Selecione o arquivo JSON exportado do formulário.'); return; }
    if (file.size > 5_000_000) { setError('O arquivo de importação deve ter até 5 MB.'); return; }
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true);
    try {
      let source: unknown;
      try { source = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); } catch { throw new Error('Este arquivo não contém um JSON válido. Exporte novamente o formulário.'); }
      const response = await fetch(`/api/assessments/classes/${classId}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }), signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível ler o formulário.');
      if (!current.signal.aborted) setPreview(data);
    } catch (cause) { if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível importar.'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  async function copyExporter() {
    try {
      const response = await fetch('/exportar-google-forms.gs', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const source = await response.text(); setCode(source);
      try { await navigator.clipboard.writeText(source); setCopyStatus('Código copiado. Cole no editor de scripts do seu formulário.'); }
      catch { setCopyStatus('Selecione e copie o código abaixo, ou baixe o arquivo do exportador.'); }
    } catch { setCopyStatus('Não foi possível copiar. Use Baixar exportador.'); }
  }
  if (reviewing && preview) return <section className="google-form-import"><button className="text-button" onClick={() => { if (confirm('Voltar à prévia e descartar as edições desta revisão?')) setReviewing(false); }}><ArrowLeft size={16} />Voltar à prévia</button><h2>Revisar formulário importado</h2><p>Confira as perguntas, a pontuação e os gabaritos. Ao salvar, a avaliação ficará em rascunho.</p>{preview.needsAnswerKey > 0 && <p className="import-review-note">Defina a alternativa correta das {preview.needsAnswerKey} questões sem gabarito antes de salvar.</p>}<AssessmentBuilder lessons={lessons} preferredLesson={lessonId} seed={preview} onSaved={onSaved} onCancel={onCancel} /></section>;
  return <section className="google-form-import">
    <div className="section-heading"><div><h2><Import size={23} />Importar Google Forms</h2><p>Traga as perguntas do seu formulário e revise antes de salvar.</p></div><button className="secondary" onClick={onCancel}>Voltar às avaliações</button></div>
    <details className="google-export-guide"><summary>Como exportar meu formulário do Google?</summary><ol><li>Abra o seu formulário no Google Forms em modo de edição.</li><li>No menu de três pontos, abra <strong>Editor de scripts</strong>.</li><li>Copie o exportador abaixo e cole no editor. Você pode adicioná-lo ao final do código existente.</li><li>Salve e execute a função <strong>exportarParaAprender</strong>. Autorize a execução na sua própria conta Google.</li><li>Volte à aba do formulário e clique em <strong>Baixar arquivo para importar</strong>. Depois, selecione o JSON aqui.</li></ol><div className="assessment-actions"><button className="secondary" onClick={() => { void copyExporter(); }}><ClipboardCopy size={17} />Copiar exportador</button><a className="button-link" href="/exportar-google-forms.gs" download="exportar-google-forms.gs"><Download size={17} />Baixar exportador</a></div>{copyStatus && <p role="status">{copyStatus}</p>}{code && <label>Código do exportador<textarea className="google-export-code" value={code} readOnly rows={8} onFocus={event => event.target.select()} /></label>}<p className="help">O exportador lê a estrutura do formulário atual. A importação não traz respostas dos alunos nem solicita sua senha do Google.</p></details>
    <div className="google-import-input"><label>Aula para receber o formulário<select value={lessonId} onChange={event => setLessonId(event.target.value)}>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}{lesson.published ? '' : ' (rascunho)'}</option>)}</select></label><label>Arquivo do Google Forms (JSON, até 5 MB)<input type="file" accept=".json,application/json" disabled={busy} onChange={event => { void readFile(event); }} /></label><p>Use o JSON gerado pelo exportador acima ou pela API oficial do Google Forms. Um link do formulário ou uma planilha de respostas não contém o mesmo conteúdo.</p></div>
    {busy && <p role="status"><FileUp size={18} />Lendo e preparando a prévia…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <section className="google-import-preview"><span className="pill">Prévia · ainda não foi salvo</span><h3>{preview.title}</h3>{preview.instructions && <p className="question-prompt">{preview.instructions}</p>}<p>{preview.questions.length} perguntas · {preview.questions.reduce((sum, question) => sum + question.points, 0).toLocaleString('pt-BR')} pontos</p>{preview.warnings.length > 0 && <details className="import-warning-list" open><summary>{preview.warnings.length} pontos para revisar</summary><ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}<ol className="import-question-list">{preview.questions.map(question => <li key={question.id}><span className="pill">{questionTypes[question.type]}</span><p className="question-prompt">{question.prompt}</p>{question.options.length > 0 && <ul>{question.options.map((option, i) => <li key={i}>{option}</li>)}</ul>}</li>)}</ol><button disabled={!lessonId} onClick={() => setReviewing(true)}>Revisar perguntas e salvar rascunho</button></section>}
  </section>;
}
