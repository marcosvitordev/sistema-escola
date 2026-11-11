'use client';
import { useEffect, useState } from 'react';
import { FileJson } from 'lucide-react';
import { assessmentRequest } from './assessment-api';
import { JsonQuestionsImport } from './json-questions-import';
import { AssessmentPage } from './assessment-page';
import { DeleteLearningItem } from './delete-learning-item';
type Data = { items: { id: string; title: string; published: boolean; _count: { questions: number } }[]; manage: boolean };
export function PdfQuestions({ documentId, manage }: { documentId: string; manage: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [importing, setImporting] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    assessmentRequest<Data>(`documents/${documentId}`).then(result => { if (active) { setData(result); setError(''); } }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [documentId, reload]);
  useEffect(() => { if (data && window.location.hash === '#questoes') { const frame = requestAnimationFrame(() => document.getElementById('questoes')?.scrollIntoView({ block: 'start' })); return () => cancelAnimationFrame(frame); } }, [!!data]);
  if (!manage && !data?.items.length && !error) return null;
  return <section id="questoes" className="pdf-questions" aria-label="Questões da apostila"><div className="section-heading"><div><h2>Questões da apostila</h2><p>{manage ? 'Adicione questões para os alunos responderem aqui, abaixo do PDF.' : 'Depois da leitura, responda aqui. A entrega das questões é separada da entrega da apostila.'}</p></div>{manage && !importing && <button className="secondary" onClick={() => setImporting(true)}><FileJson size={18} />Importar questões JSON</button>}</div>
    {error && <p className="error" role="alert">{error}<button className="text-button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p>}
    {importing && <JsonQuestionsImport documentId={documentId} onCancel={() => setImporting(false)} onSaved={() => { setImporting(false); setReload(value => value + 1); }} />}
    {data?.items.map(item => <div className="pdf-question-set" key={item.id}>{manage && <div className="pdf-question-set-actions"><DeleteLearningItem endpoint={`/api/assessments/items/${item.id}`} title={item.title} kind="avaliação" onDeleted={() => setReload(value => value + 1)} /></div>}<AssessmentPage id={item.id} embedded /></div>)}
    {manage && data && !data.items.length && !importing && <p className="help">Nenhuma questão vinculada. Use o botão de importação para adicionar uma atividade em JSON.</p>}
  </section>;
}
