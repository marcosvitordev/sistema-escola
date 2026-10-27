'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
export async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
export function Form({ endpoint, children, onSuccess, label = 'Salvar', transform }: { endpoint: string; children: ReactNode; onSuccess: () => void; label?: string; transform?: (data: Record<string, string>) => unknown }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    try {
      const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
      await request(endpoint, transform ? transform(data) : data);
      form.reset(); onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Verifique sua conexão e tente novamente.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>{children}{error && <p className="error" role="alert">{error}</p>}<button disabled={busy} type="submit">{busy ? 'Salvando…' : label}</button></form>;
}
export function Field({ label, name, type = 'text', required = true, placeholder, minLength }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; minLength?: number }) {
  return <label>{label}<input name={name} type={type} required={required} maxLength={type === 'password' ? 128 : 120} minLength={minLength ?? (type === 'password' ? 10 : undefined)} autoComplete={type === 'password' ? 'new-password' : undefined} placeholder={placeholder} /></label>;
}
