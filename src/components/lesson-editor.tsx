'use client';
import { useState, type FormEvent } from 'react';
import { request } from './form';
import { studentDateKey } from '@/lib/student-dates';

export type EditableLesson = { id: string; title: string; module: string; description: string; scheduledAt: string | null };
export function LessonEditor({ lesson, onSaved, onCancel }: { lesson: EditableLesson; onSaved: (lesson: EditableLesson) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { onSaved(await request(`learning/lessons/${lesson.id}/edit`, data)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a aula.'); }
    finally { setBusy(false); }
  }
  return <form className="lesson-edit-form card" aria-label="Editar aula" onSubmit={save}>
    <div><h4>Editar aula</h4><p className="help">Atualize as informações da aula. Apostilas, atividades e entregas continuam vinculadas.</p></div>
    <fieldset disabled={busy}>
      <label>Título da aula<input name="title" defaultValue={lesson.title} required minLength={3} maxLength={150} autoFocus /></label>
      <label>Módulo<input name="module" defaultValue={lesson.module} required maxLength={100} /></label>
      <label className="lesson-edit-description">Descrição<textarea aria-label="Descrição" name="description" defaultValue={lesson.description} rows={3} maxLength={3000} /></label>
      <label>Data prevista<input aria-label="Data prevista" name="scheduledAt" type="date" defaultValue={lesson.scheduledAt ? studentDateKey(lesson.scheduledAt) : ''} /><small>Opcional. Apague a data para deixar sem previsão.</small></label>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="lesson-edit-actions"><button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button><button className="secondary" type="button" disabled={busy} onClick={onCancel}>Cancelar edição</button></div>
  </form>;
}
