'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio, ArrowRight } from 'lucide-react';
export function ClassLiveLink({ classId, name, manage = false }: { classId: string; name: string; manage?: boolean }) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    let active = true, pending = false; const controller = new AbortController();
    const load = async () => {
      if (pending) return; pending = true;
      try { const response = await fetch(`/api/live/classes/${classId}/status`, { cache: 'no-store', signal: controller.signal }); if (response.ok) { const data = await response.json(); if (active) setLive(!!data.live); } }
      catch { /* The room link stays available during a temporary status failure. */ }
      finally { pending = false; }
    };
    void load(); const interval = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    return () => { active = false; controller.abort(); clearInterval(interval); };
  }, [classId]);
  return <Link className={`class-live-link ${live ? 'is-live' : ''}`} href={`/turmas/${classId}/ao-vivo`}><Radio size={23} /><div><strong>{live ? 'Aula ao vivo agora' : 'Aula ao vivo'}</strong><span>{manage ? 'Compartilhar tela ou vídeo com a turma' : name}</span></div><span className="class-live-cta">{manage ? 'Abrir transmissão' : live ? 'Assistir ao vivo' : 'Abrir sala'}<ArrowRight size={17} /></span></Link>;
}
