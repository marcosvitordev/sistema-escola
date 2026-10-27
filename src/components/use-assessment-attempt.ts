'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { answersSchema } from '@/lib/assessments';
import type { Answer, Answers, AttemptFile, AttemptResponse } from '@/lib/assessment-types';
import { assessmentRequest, AssessmentError } from './assessment-api';

export function useAssessmentAttempt(attemptId: string) {
  const [data, setData] = useState<AttemptResponse | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [status, setStatus] = useState('Carregando respostas…');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const state = useRef({ answers: {} as Answers, version: 0, dirty: false, generation: 0, canWrite: false, conflict: false, key: '', recoveredKey: '', recoveredRaw: '', localFailed: false, dueAt: null as string | null });
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = useCallback(() => {
    const current = state.current;
    try { localStorage.setItem(current.key, JSON.stringify({ answers: current.answers, version: current.version, savedAt: Date.now() })); current.localFailed = false; }
    catch { current.localFailed = true; setError('Não foi possível guardar o rascunho neste navegador. Mantenha a página aberta até confirmar o salvamento.'); }
  }, []);
  const flush = useCallback((): Promise<boolean> => {
    if (saving.current) return saving.current;
    const current = state.current;
    if (!current.dirty) return Promise.resolve(true);
    if (!current.canWrite || current.conflict) return Promise.resolve(false);
    const generation = current.generation;
    const task = (async () => {
      setStatus('Salvando respostas…');
      try {
        const result = await assessmentRequest<{ version: number }>(`attempts/${attemptId}`, { version: current.version, answers: current.answers }, 'PUT');
        current.version = result.version;
        if (generation === current.generation) {
          current.dirty = false;
          try { localStorage.removeItem(current.key); if (current.recoveredKey && localStorage.getItem(current.recoveredKey) === current.recoveredRaw) localStorage.removeItem(current.recoveredKey); } catch { /* The database save already succeeded. */ }
          setStatus('Todas as respostas salvas'); setError('');
        } else { persist(); setStatus('Respostas pendentes de salvamento…'); }
        return true;
      } catch (e) {
        if (e instanceof AssessmentError && e.status === 409) {
          if (current.dueAt && new Date(current.dueAt).getTime() < Date.now()) { current.canWrite = false; setStatus('Prazo encerrado · rascunho preservado'); }
          else { current.conflict = true; setConflict(true); setStatus('Outra versão foi salva · escolha como continuar'); }
        } else setStatus(current.localFailed ? 'Salvamento pendente · mantenha esta página aberta' : 'Sem sincronização · rascunho salvo neste navegador');
        setError(e instanceof Error ? e.message : 'Verifique sua conexão.'); return false;
      } finally { saving.current = null; }
    })();
    saving.current = task; return task;
  }, [attemptId, persist]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await assessmentRequest<AttemptResponse>(`attempts/${attemptId}`);
        if (!active) return;
        const current = state.current;
        current.version = response.attempt.version; current.answers = answersSchema.parse(response.attempt.answers); current.dueAt = response.assessment.dueAt;
        current.canWrite = !response.manage && !response.attempt.submittedAt && (!current.dueAt || new Date(current.dueAt).getTime() >= Date.now());
        let tab = crypto.randomUUID();
        try { tab = sessionStorage.getItem('aprender-tab') || tab; sessionStorage.setItem('aprender-tab', tab); } catch { /* Keep a separate draft when session storage is unavailable. */ }
        const prefix = `aprender-assessment-v1:${attemptId}:`;
        current.key = prefix + tab;
        if (!response.manage && !response.attempt.submittedAt) {
          try {
            const drafts: { key: string; raw: string; answers: Answers; version: number; savedAt: number }[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)!; if (!key.startsWith(prefix)) continue;
              try { const raw = localStorage.getItem(key)!; const draft = JSON.parse(raw); if (Number.isInteger(draft.version) && Number.isFinite(draft.savedAt)) drafts.push({ key, raw, answers: answersSchema.parse(draft.answers), version: draft.version, savedAt: draft.savedAt }); } catch { /* Leave malformed drafts untouched for manual recovery. */ }
            }
            const draft = drafts.find(d => d.key === current.key) || drafts.sort((a, b) => b.savedAt - a.savedAt)[0];
            if (draft && JSON.stringify(draft.answers) !== JSON.stringify(current.answers)) {
              current.answers = draft.answers; current.dirty = true; current.recoveredKey = draft.key; current.recoveredRaw = draft.raw;
              if (draft.version !== current.version) { current.conflict = true; setConflict(true); }
            }
          } catch { /* Server persistence remains available. */ }
        }
        setData(response); setAnswers(current.answers);
        setStatus(response.attempt.submittedAt ? 'Tentativa entregue' : current.conflict ? 'Rascunho recuperado · há outra versão no servidor' : !current.canWrite && !response.manage ? 'Prazo encerrado' : current.dirty ? 'Rascunho recuperado · sincronizando…' : 'Todas as respostas salvas');
        if (current.dirty && current.canWrite && !current.conflict) void flush();
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Não foi possível abrir as respostas.'); }
    }
    void load();
    const sync = () => { void flush(); };
    const unload = (event: BeforeUnloadEvent) => { if (state.current.dirty && state.current.localFailed) event.preventDefault(); };
    const interval = setInterval(sync, 5000);
    window.addEventListener('online', sync); window.addEventListener('beforeunload', unload);
    return () => { active = false; clearTimeout(timer.current); clearInterval(interval); window.removeEventListener('online', sync); window.removeEventListener('beforeunload', unload); };
  }, [attemptId, flush]);
  function change(questionId: string, value: Answer) {
    const current = state.current;
    if (!current.canWrite || current.conflict || submitting) return;
    current.answers = { ...current.answers, [questionId]: value }; current.dirty = true; current.generation++;
    setAnswers(current.answers); persist(); setStatus('Respostas pendentes de salvamento…');
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 900);
  }
  async function resolve(local: boolean) {
    if (!confirm(local ? 'Usar o rascunho desta página para substituir a versão atual do servidor?' : 'Descartar este rascunho e usar a versão do servidor?')) return;
    try {
      const response = await assessmentRequest<AttemptResponse>(`attempts/${attemptId}`);
      if (local && (response.attempt.submittedAt || (response.assessment.dueAt && new Date(response.assessment.dueAt).getTime() < Date.now()))) throw new Error('A tentativa está encerrada. Peça orientação ao professor; seu rascunho permanece preservado.');
      const current = state.current; current.version = response.attempt.version; current.conflict = false;
      if (!local) {
        current.answers = answersSchema.parse(response.attempt.answers); current.dirty = false;
        try { localStorage.removeItem(current.key); if (current.recoveredKey && localStorage.getItem(current.recoveredKey) === current.recoveredRaw) localStorage.removeItem(current.recoveredKey); } catch { /* Nothing to remove when storage is restricted. */ }
      }
      current.canWrite = !response.manage && !response.attempt.submittedAt && (!response.assessment.dueAt || new Date(response.assessment.dueAt).getTime() >= Date.now());
      setData(response); setAnswers(current.answers); setConflict(false); setError('');
      if (local) { persist(); await flush(); } else setStatus('Versão do servidor carregada');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível resolver o conflito.'); }
  }
  async function submit() {
    if (submitting || !confirm('Entregar as respostas? Esta tentativa ficará bloqueada para edição.')) return;
    setSubmitting(true);
    try {
      if (!await flush() || (state.current.dirty && !await flush()) || state.current.conflict) throw new Error('Aguarde o salvamento de todas as respostas antes de entregar.');
      await assessmentRequest(`attempts/${attemptId}/submit`, { version: state.current.version });
      state.current.canWrite = false; setStatus('Tentativa entregue');
      setData(await assessmentRequest<AttemptResponse>(`attempts/${attemptId}`));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível entregar.'); }
    finally { setSubmitting(false); }
  }
  function addFile(file: AttemptFile) { setData(current => current ? { ...current, attempt: { ...current.attempt, files: [...current.attempt.files.filter(f => f.questionId !== file.questionId), file] } } : null); }
  return { data, answers, status, error, conflict, change, flush, resolve, submit, submitting, addFile, pending: () => state.current.dirty || saving.current !== null || state.current.conflict };
}
