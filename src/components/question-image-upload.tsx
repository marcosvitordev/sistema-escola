'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import type { QuestionView } from '@/lib/assessment-types';
import { assessmentRequest } from './assessment-api';
import { QuestionImages } from './question-images';

export function QuestionImageUpload({ assessmentId, questions, locked, busy, onBusy, onSaved }: { assessmentId: string; questions: QuestionView[]; locked: boolean; busy: boolean; onBusy: (value: boolean) => void; onSaved: () => Promise<void> }) {
  const [questionId, setQuestionId] = useState(questions[0]?.id || '');
  const [selection, setSelection] = useState<{ file: File; importId: string } | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replace, setReplace] = useState(false);
  const question = questions.find(item => item.id === questionId) || questions[0];
  const index = questions.findIndex(item => item.id === question?.id);
  useEffect(() => {
    if (!selection) { setPreview(''); return; }
    const url = URL.createObjectURL(selection.file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selection]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selection || !question || busy || locked) return;
    if (replace && !confirm('Substituir todas as imagens desta questão pela imagem selecionada?')) return;
    onBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData(); form.set('questionId', question.id); form.set('file', selection.file); if (!replace) { form.set('append', 'true'); form.set('importId', selection.importId); }
      await assessmentRequest(`items/${assessmentId}/image`, form);
      setSelection(null); setReplace(false); setNotice(`Imagem ${replace ? 'substituída na' : 'adicionada à'} questão ${index + 1}.`); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a imagem. Tente novamente.'); }
    finally { onBusy(false); }
  }
  if (!question) return null;
  return <section className="card question-image-upload" aria-label="Imagens das questões"><div className="section-heading"><div><h2>Imagens das questões</h2><p>Escolha a questão e anexe uma imagem ao enunciado. As imagens anteriores serão mantidas.</p></div><ImagePlus size={26} /></div>
    <label>Questão que receberá a imagem<select aria-label="Questão que receberá a imagem" disabled={busy} value={question.id} onChange={event => { setQuestionId(event.target.value); setSelection(null); setReplace(false); setError(''); setNotice(''); }}>{questions.map((item, position) => <option key={item.id} value={item.id}>Questão {position + 1} — {item.prompt.slice(0, 100)}</option>)}</select></label>
    <p className="question-prompt">{question.prompt}</p>
    <QuestionImages question={question} index={index} />
    {locked ? <p className="help">Já existem respostas iniciadas. As imagens estão protegidas; use Duplicar avaliação para preparar uma nova versão com outras imagens.</p> : <form onSubmit={save}>
      <label className="upload-label"><ImagePlus size={18} />Selecionar imagem<input aria-label="Selecionar imagem da questão" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; setError(''); setNotice(''); setSelection(null);
        if (!file) return;
        if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 5_000_000) { setError('Selecione uma imagem PNG ou JPEG de até 5 MB.'); return; }
        setSelection({ file, importId: crypto.randomUUID() });
      }} /></label><p className="help">PNG ou JPEG, até 5 MB por imagem. Confira a prévia antes de adicionar.</p>
      {selection && <figure className="question-upload-preview">{preview && <img src={preview} alt="Prévia da imagem a enviar" />}<figcaption>{selection.file.name}</figcaption></figure>}
      {(question.images?.length || question.imageId) && <label className="question-image-replace"><input type="checkbox" checked={replace} disabled={busy} onChange={event => setReplace(event.target.checked)} />Substituir todas as imagens desta questão</label>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="assessment-actions"><button type="submit" disabled={busy || !selection}>{busy ? 'Enviando imagem…' : replace ? 'Substituir imagens da questão' : 'Adicionar imagem à questão'}</button>{selection && <button type="button" className="secondary" disabled={busy} onClick={() => { setSelection(null); setError(''); }}>Cancelar envio</button>}</div>
    </form>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
