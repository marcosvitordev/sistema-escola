'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { annotationsSchema, type Annotation } from '@/lib/pdf-annotations';
type Work = { version: number; annotations: Annotation[]; submittedAt: string | null; updatedAt: string; feedback: { id: string; comment: string; grade: number | null; createdAt: string }[] };
export type WorkResponse = { document: { id: string; title: string; pageCount: number; lesson: { title: string } }; work: Work | null; readOnly: boolean; userId: string };
type Draft = { annotations: Annotation[]; baseVersion: number; savedAt: number };
export function useDocumentWork(documentId: string, studentId?: string) {
  const query = studentId ? `?student=${encodeURIComponent(studentId)}` : '';
  const base = `/api/learning/documents/${documentId}`;
  const [data, setData] = useState<WorkResponse | null>(null);
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [status, setStatus] = useState('Carregando…');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const refs = useRef({ notes: [] as Annotation[], version: 0, dirty: false, saving: false, conflict: false, readOnly: true, generation: 0, key: '', recoveredKey: '', recoveredRaw: '', localFailed: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = useCallback(() => {
    const state = refs.current;
    try {
      localStorage.setItem(state.key, JSON.stringify({ annotations: state.notes, baseVersion: state.version, savedAt: Date.now() }));
      state.localFailed = false;
    } catch { state.localFailed = true; setError('O navegador não permitiu guardar o rascunho local. Mantenha esta página aberta até confirmar o salvamento no servidor.'); }
  }, []);
  const flush = useCallback(async () => {
    const state = refs.current;
    if (!state.dirty || state.saving || state.conflict || state.readOnly) return false;
    state.saving = true;
    const generation = state.generation;
    setStatus('Salvando…');
    try {
      const response = await fetch(`${base}/work${query}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: state.version, annotations: state.notes }) });
      const result = await response.json();
      if (response.status === 409) {
        state.conflict = true; setConflict(true); setStatus('Conflito de versões · rascunho preservado'); return false;
      }
      if (!response.ok) throw new Error(result.error);
      state.version = result.version;
      if (state.generation === generation) {
        state.dirty = false;
        try {
          localStorage.removeItem(state.key);
          if (state.recoveredKey && localStorage.getItem(state.recoveredKey) === state.recoveredRaw) localStorage.removeItem(state.recoveredKey);
        } catch { /* The server remains the source of truth when local storage is unavailable. */ }
        setStatus('Todas as alterações salvas'); setError('');
      } else { persist(); setStatus('Alterações pendentes…'); }
      return true;
    } catch (e) {
      setStatus(state.localFailed ? 'Salvamento pendente · mantenha esta página aberta' : 'Sem sincronização · rascunho salvo neste navegador');
      setError(e instanceof Error ? e.message : 'Reconecte para sincronizar.');
      return false;
    } finally { state.saving = false; }
  }, [base, query, persist]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${base}/work${query}`, { cache: 'no-store' });
        const result: WorkResponse & { error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!active) return;
        const state = refs.current;
        state.version = result.work?.version ?? 0; state.readOnly = result.readOnly;
        state.notes = annotationsSchema.parse(result.work?.annotations ?? []);
        let tab = '';
        try { tab = sessionStorage.getItem('aprender-tab') || crypto.randomUUID(); sessionStorage.setItem('aprender-tab', tab); } catch { tab = crypto.randomUUID(); }
        const prefix = `aprender-draft-v1:${result.userId}:${documentId}:`;
        state.key = `${prefix}${tab}`;
        if (!result.readOnly) {
          try {
            const candidates: { key: string; draft: Draft; raw: string }[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)!;
              if (!key.startsWith(prefix)) continue;
              try {
                const raw = localStorage.getItem(key)!; const draft = JSON.parse(raw) as Draft;
                annotationsSchema.parse(draft.annotations);
                if (Number.isInteger(draft.baseVersion) && Number.isFinite(draft.savedAt)) candidates.push({ key, draft, raw });
              } catch { /* Keep unreadable drafts for manual recovery without blocking this document. */ }
            }
            const saved = candidates.find(c => c.key === state.key) || candidates.sort((a, b) => b.draft.savedAt - a.draft.savedAt)[0];
            if (saved) {
              state.notes = saved.draft.annotations; state.dirty = true; state.recoveredKey = saved.key; state.recoveredRaw = saved.raw;
              if (saved.draft.baseVersion !== state.version) { state.conflict = true; setConflict(true); }
            }
          } catch { /* Autosave can still work while browser persistence is restricted. */ }
        }
        setData(result); setNotes(state.notes);
        setStatus(state.conflict ? 'Conflito de versões · rascunho recuperado' : state.dirty ? 'Rascunho recuperado · sincronizando…' : 'Todas as alterações salvas');
        if (state.dirty && !state.conflict) void flush();
      } catch (e) { if (active) { setError(e instanceof Error ? e.message : 'Falha ao abrir a apostila.'); setStatus('Não foi possível carregar'); } }
    }
    void load();
    const sync = () => { void flush(); };
    const unload = (event: BeforeUnloadEvent) => { if (refs.current.dirty && refs.current.localFailed) event.preventDefault(); };
    window.addEventListener('online', sync); window.addEventListener('beforeunload', unload);
    const interval = setInterval(sync, 5000);
    return () => { active = false; clearInterval(interval); clearTimeout(timer.current); window.removeEventListener('online', sync); window.removeEventListener('beforeunload', unload); };
  }, [base, query, documentId, flush]);
  function change(next: Annotation[]) {
    const state = refs.current;
    if (state.readOnly || state.conflict) return;
    state.notes = next; state.dirty = true; state.generation++; setNotes(next); persist();
    setStatus('Alterações pendentes…'); clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 700);
  }
  async function resolve(useLocal: boolean) {
    try {
      const response = await fetch(`${base}/work${query}`, { cache: 'no-store' });
      const result: WorkResponse = await response.json();
      if (!response.ok) throw new Error('Não foi possível consultar a versão atual.');
      if (result.readOnly && useLocal) throw new Error('A apostila foi entregue. Peça ao professor para reabrir; seu rascunho continua preservado.');
      const state = refs.current;
      state.version = result.work?.version ?? 0; state.readOnly = result.readOnly;
      if (!useLocal) {
        state.notes = annotationsSchema.parse(result.work?.annotations ?? []); state.dirty = false;
        try { localStorage.removeItem(state.key); if (state.recoveredKey && localStorage.getItem(state.recoveredKey) === state.recoveredRaw) localStorage.removeItem(state.recoveredKey); } catch { /* No local draft to remove. */ }
      }
      state.conflict = false; setConflict(false); setData(result); setNotes(state.notes); setError('');
      if (useLocal) { persist(); await flush(); } else setStatus('Versão do servidor carregada');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão.'); }
  }
  async function submit() {
    if (!window.confirm('Entregar esta apostila? A edição ficará bloqueada até o professor reabrir.')) return;
    await flush();
    const state = refs.current;
    if (state.dirty || state.saving || state.conflict) { setError('Aguarde o salvamento de todas as alterações antes de entregar.'); return; }
    try {
      const response = await fetch(`${base}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: state.version }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      state.readOnly = true; setData(current => current ? { ...current, readOnly: true, work: current.work ? { ...current.work, submittedAt: new Date().toISOString() } : null } : null); setStatus('Apostila entregue');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao entregar.'); }
  }
  return { data, notes, change, status, error, conflict, resolve, submit, flush, base, query, pending: () => refs.current.dirty || refs.current.saving || refs.current.conflict };
}
