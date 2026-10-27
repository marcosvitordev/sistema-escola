'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ClipboardCopy, Download, FileUp, Import } from 'lucide-react';
import type { GoogleFormsPreview, ImportImageBinding } from '@/lib/google-forms-import';
import { readGoogleFormsPackage, type ImportAsset } from '@/lib/google-forms-package';
import type { LessonChoice, QuestionView } from '@/lib/assessment-types';
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
  const [assets, setAssets] = useState<Record<string, ImportAsset & { url: string }>>({});
  const [bindings, setBindings] = useState<ImportImageBinding[]>([]);
  const [imageProgress, setImageProgress] = useState('');
  const [createdId, setCreatedId] = useState('');
  const sentImages = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { Object.values(assets).forEach(asset => URL.revokeObjectURL(asset.url)); }, [assets]);
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.value = ''; setPreview(null); setReviewing(false); setError(''); setAssets({}); setBindings([]); setCreatedId(''); sentImages.current.clear();
    if (!/\.(json|zip)$/i.test(file.name)) { setError('Selecione o ZIP ou JSON exportado do formulário.'); return; }
    if (file.size > (/\.zip$/i.test(file.name) ? 30_000_000 : 5_000_000)) { setError('Use ZIP de até 30 MB ou JSON de até 5 MB. Cada imagem aceita até 5 MB.'); return; }
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true);
    try {
      const { source, assets: images } = readGoogleFormsPackage(new Uint8Array(await file.arrayBuffer()), file.name);
      if (current.signal.aborted) return;
      setAssets(Object.fromEntries(images.map(asset => [asset.id, { ...asset, url: URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType })) }])));
      const response = await fetch(`/api/assessments/classes/${classId}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }), signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível ler o formulário.');
      if (!current.signal.aborted) { setPreview(data); setBindings(data.imageBindings || []); }
    } catch (cause) { if (!current.signal.aborted) { setAssets({}); setError(cause instanceof Error ? cause.message : 'Não foi possível importar.'); } }
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
  function review() {
    const counts: Record<string, number> = {};
    for (const binding of bindings.filter(binding => binding.questionId)) {
      if (!assets[binding.assetId]) { setError('Uma imagem não está no pacote. Exporte e importe o ZIP novamente.'); return; }
      counts[binding.questionId] = (counts[binding.questionId] || 0) + 1;
      if (counts[binding.questionId] > 25) { setError('Cada pergunta aceita até 25 imagens. Ajuste as associações antes de continuar.'); return; }
    }
    setError(''); setReviewing(true);
  }
  async function saveImages(id: string, questionIds: string[]) {
    setCreatedId(id);
    const selected = bindings.filter(binding => questionIds.includes(binding.questionId));
    try {
      for (let i = 0; i < selected.length; i++) {
        const binding = selected[i]; if (sentImages.current.has(binding.id)) continue;
        const asset = assets[binding.assetId]; if (!asset) throw new Error('Imagem ausente no pacote. Reimporte o arquivo.');
        setImageProgress(`Enviando imagem ${i + 1} de ${selected.length}…`);
        const form = new FormData(); form.set('questionId', binding.questionId); form.set('append', 'true'); form.set('importId', binding.id);
        const caption = binding.caption.replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 130) || 'Imagem da pergunta';
        form.set('file', new File([asset.bytes], `${caption}.${asset.mimeType === 'image/png' ? 'png' : 'jpg'}`, { type: asset.mimeType }));
        const response = await fetch(`/api/assessments/items/${id}/image`, { method: 'POST', body: form });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Não foi possível enviar uma imagem. Tente salvar novamente.'); }
        sentImages.current.add(binding.id);
      }
    } finally { setImageProgress(''); }
  }
  function backFromReview() {
    if (createdId) { window.location.assign(`/atividades/${createdId}`); return; }
    if (confirm('Voltar à prévia e descartar as edições desta revisão?')) setReviewing(false);
  }
  const importedImages: Record<string, { src: string; caption: string }[]> = {};
  for (const binding of bindings) if (binding.questionId && assets[binding.assetId]) (importedImages[binding.questionId] ||= []).push({ src: assets[binding.assetId].url, caption: binding.caption });
  if (reviewing && preview) return <section className="google-form-import"><button className="text-button" disabled={!!imageProgress} onClick={backFromReview}><ArrowLeft size={16} />{createdId ? 'Abrir rascunho criado' : 'Voltar à prévia'}</button><h2>Revisar formulário importado</h2><p>Confira as perguntas, a pontuação e os gabaritos. Ao salvar, a avaliação ficará em rascunho.</p>{preview.needsAnswerKey > 0 && <p className="import-review-note">Defina a alternativa correta das {preview.needsAnswerKey} questões sem gabarito antes de salvar.</p>}{imageProgress && <p role="status">{imageProgress}</p>}<AssessmentBuilder lessons={lessons} preferredLesson={lessonId} seed={preview} importedImages={importedImages} onSaveImages={saveImages} onSaved={onSaved} onCancel={onCancel} /></section>;
  return <section className="google-form-import">
    <div className="section-heading"><div><h2><Import size={23} />Importar Google Forms</h2><p>Traga as perguntas do seu formulário e revise antes de salvar.</p></div><button className="secondary" onClick={onCancel}>Voltar às avaliações</button></div>
    <details className="google-export-guide"><summary>Como exportar meu formulário do Google?</summary><ol><li>Abra o seu formulário no Google Forms em modo de edição.</li><li>No menu de três pontos, abra <strong>Editor de scripts</strong>.</li><li>Copie o exportador abaixo. Se já usou uma versão anterior, substitua a função antiga e os auxiliares; preserve os outros scripts do formulário.</li><li>Salve e execute <strong>exportarParaAprender</strong> para incluir imagens separadas. Para imagens dentro das perguntas e alternativas, use a configuração completa abaixo.</li><li>Volte à aba do formulário e clique em <strong>Baixar arquivo para importar</strong>. Depois, envie o ZIP completo aqui, sem extrair. Formulários sem imagens podem gerar JSON.</li></ol><div className="assessment-actions"><button className="secondary" onClick={() => { void copyExporter(); }}><ClipboardCopy size={17} />Copiar exportador</button><a className="button-link" href="/exportar-google-forms.gs" download="exportar-google-forms.gs"><Download size={17} />Baixar exportador</a></div>{copyStatus && <p role="status">{copyStatus}</p>}{code && <label>Código do exportador<textarea className="google-export-code" value={code} readOnly rows={8} onFocus={event => event.target.select()} /></label>}<p className="help">O exportador lê a estrutura do formulário atual. A importação não traz respostas dos alunos nem solicita sua senha do Google.</p></details>
    <details className="google-export-guide"><summary>Incluir imagens dentro de perguntas e alternativas</summary><p>A função completa usa a API oficial do Google Forms, pois o serviço simples não fornece essas imagens.</p><ol><li>No Google Cloud, crie ou selecione um projeto e ative a <strong>Google Forms API</strong>. Configure a tela de consentimento para a sua conta conforme o guia do Google.</li><li>Em Configurações do projeto no Apps Script, associe o número desse projeto Cloud e marque a opção para mostrar o arquivo <strong>appsscript.json</strong>.</li><li>No manifesto, mescle os escopos do exemplo abaixo aos que já usa. Preserve as outras configurações do projeto.</li><li>Salve, execute <strong>exportarParaAprenderComImagens</strong> e autorize a leitura na sua própria conta Google.</li><li>Baixe o ZIP e envie aqui. As imagens serão copiadas para o sistema.</li></ol><div className="assessment-actions"><a className="button-link" href="/google-forms-appsscript.json" download="appsscript-exemplo.json">Baixar manifesto de exemplo</a><a href="https://developers.google.com/workspace/forms/api/guides/apps-script-setup?hl=pt-br" target="_blank" rel="noreferrer">Abrir guia oficial do Google</a></div><p className="help">O token de autorização fica no Google. Não há leitura de respostas de alunos. Cada imagem aceita até 5 MB.</p></details><div className="google-import-input"><label>Aula para receber o formulário<select value={lessonId} onChange={event => setLessonId(event.target.value)}>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}{lesson.published ? '' : ' (rascunho)'}</option>)}</select></label><label>Arquivo do Google Forms (ZIP com imagens ou JSON)<input type="file" accept=".zip,.json,application/zip,application/json" disabled={busy} onChange={event => { void readFile(event); }} /></label><p>Envie o ZIP completo para incluir as imagens, sem extrair. ZIP de até 30 MB; JSON de até 5 MB. As imagens são enviadas separadamente, com limite de 5 MB cada.</p></div>
    {busy && <p role="status"><FileUp size={18} />Lendo e preparando a prévia…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <section className="google-import-preview"><span className="pill">Prévia · ainda não foi salvo</span><h3>{preview.title}</h3>{preview.instructions && <p className="question-prompt">{preview.instructions}</p>}<p>{preview.questions.length} perguntas · {preview.questions.reduce((sum, question) => sum + question.points, 0).toLocaleString('pt-BR')} pontos</p>{preview.warnings.length > 0 && <details className="import-warning-list" open><summary>{preview.warnings.length} pontos para revisar</summary><ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}<ol className="import-question-list">{preview.questions.map(question => <li key={question.id}><span className="pill">{questionTypes[question.type]}</span><p className="question-prompt">{question.prompt}</p>{question.options.length > 0 && <ul>{question.options.map((option, i) => <li key={i}>{option}</li>)}</ul>}</li>)}</ol><ImageAssignments bindings={bindings} assets={assets} questions={preview.questions} onChange={setBindings} /><button disabled={!lessonId} onClick={review}>Revisar perguntas e salvar rascunho</button></section>}
  </section>;
}

function ImageAssignments({ bindings, assets, questions, onChange }: { bindings: ImportImageBinding[]; assets: Record<string, { url: string }>; questions: QuestionView[]; onChange: (bindings: ImportImageBinding[]) => void }) {
  if (!bindings.length) return null;
  return <section className="google-import-images"><h3>Conferir imagens</h3><p>Confira em qual pergunta cada imagem deve aparecer. Você pode alterar a associação ou escolher não incluir a imagem.</p>{bindings.map((binding, index) => <div className="google-import-image" key={binding.id}>{assets[binding.assetId] && <img src={assets[binding.assetId].url} alt={binding.caption} loading="lazy" />}<label>Destino da imagem {index + 1} · {binding.caption}<select value={binding.questionId} onChange={event => onChange(bindings.map(item => item.id === binding.id ? { ...item, questionId: event.target.value } : item))}><option value="">Não incluir esta imagem</option>{questions.map((question, i) => <option key={question.id} value={question.id}>Questão {i + 1} · {question.prompt.slice(0, 85)}</option>)}</select></label></div>)}</section>;
}
