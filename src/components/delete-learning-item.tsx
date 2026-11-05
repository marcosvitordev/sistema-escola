'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export function DeleteLearningItem({ endpoint, title, kind, onDeleted }: { endpoint: string; title: string; kind: 'apostila' | 'avaliação'; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (busy || !window.confirm(`Excluir ${kind} "${title}"?\n\nAs respostas, entregas e correções deste item também serão apagadas. Esta ação não pode ser desfeita.`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir.');
      onDeleted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <span className="delete-item-control"><button type="button" className="text-button" disabled={busy} aria-label={`Excluir ${kind}: ${title}`} onClick={remove}><Trash2 size={15} />{busy ? 'Excluindo…' : 'Excluir'}</button>{error && <span className="error" role="alert">{error}</span>}</span>;
}
