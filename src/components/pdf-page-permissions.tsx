'use client';
import { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

export function PdfPagePermissions({ documentId, pageCount, blockedPages, accessVersion, onSaved }: { documentId: string; pageCount: number; blockedPages: number[]; accessVersion: number; onSaved: (access: { blockedPages: number[]; accessVersion: number }) => void }) {
  const [blocked, setBlocked] = useState(blockedPages);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = [...blocked].sort((a, b) => a - b).join(',') !== blockedPages.join(',');
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/learning/documents/${documentId}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockedPages: blocked, accessVersion }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
      onSaved(result); setMessage('Liberação de páginas atualizada para todos os alunos desta turma.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha de conexão.'); }
    finally { setBusy(false); }
  }
  return <details className="pdf-access-panel"><summary><ShieldCheck size={19} />Páginas liberadas aos alunos<span>{pageCount - blockedPages.length} de {pageCount}</span></summary><div className="pdf-access-content"><p>Marque as páginas que os alunos podem ver. As demais ficam bloqueadas até você liberar. Você continua vendo a apostila completa.</p><div className="pdf-access-actions"><button className="secondary" disabled={busy} onClick={() => { setBlocked([]); setMessage(''); }}>Liberar todas</button><button className="secondary" disabled={busy} onClick={() => { setBlocked(Array.from({ length: pageCount }, (_, i) => i + 1)); setMessage(''); }}>Bloquear todas</button></div><fieldset disabled={busy} className="pdf-access-grid"><legend>Permissão de visualização por página</legend>{Array.from({ length: pageCount }, (_, index) => { const n = index + 1; return <label key={n} className={blocked.includes(n) ? 'is-blocked' : ''}><input type="checkbox" checked={!blocked.includes(n)} onChange={event => { setBlocked(current => event.target.checked ? current.filter(page => page !== n) : [...current, n]); setMessage(''); }} />Página {n}{blocked.includes(n) && <LockKeyhole size={14} />}</label>; })}</fieldset><div className="pdf-access-actions"><button disabled={busy || !dirty} onClick={save}>{busy ? 'Salvando…' : 'Salvar liberação'}</button>{dirty && <button className="secondary" disabled={busy} onClick={() => { setBlocked(blockedPages); setError(''); }}>Descartar alterações</button>}</div><small>O bloqueio não recolhe arquivos baixados anteriormente. As permissões em páginas abertas são atualizadas quando o aluno estiver conectado.</small>{message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</div></details>;
}
