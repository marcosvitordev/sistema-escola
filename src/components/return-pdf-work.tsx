'use client';
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { request } from './form';

export function ReturnPdfWork({ documentId, studentId, version, studentName, onReturned }: { documentId: string; studentId: string; version: number; studentName?: string; onReturned?: (result: { version: number; updatedAt: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function returnWork() {
    if (busy || !confirm(`Devolver esta apostila${studentName ? ` de ${studentName}` : ''} para ajustes? O aluno poderá editar e entregar novamente. As respostas e correções serão preservadas.`)) return;
    setBusy(true); setError('');
    try {
      const result = await request(`learning/documents/${documentId}/reopen?student=${encodeURIComponent(studentId)}`, { version });
      if (onReturned) onReturned(result); else window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível devolver a apostila.'); }
    finally { setBusy(false); }
  }
  return <div className="pdf-return-action"><button type="button" className="secondary" disabled={busy} onClick={() => { void returnWork(); }}><Undo2 size={16} />{busy ? 'Devolvendo…' : 'Devolver para ajustes'}</button>{error && <p className="error" role="alert">{error}</p>}</div>;
}
