'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { ClassDetails, type Classroom, type Person } from './class-details';
import { request } from './form';

export function ClassPage({ initialClassroom, initialStudents }: { initialClassroom: Classroom; initialStudents: Person[] }) {
  const [classroom, setClassroom] = useState(initialClassroom);
  const [students, setStudents] = useState(initialStudents);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  useEffect(() => { const value = localStorage.getItem('aprender-theme') === 'dark'; setDark(value); document.documentElement.dataset.theme = value ? 'dark' : 'light'; }, []);
  function theme() { const value = !dark; setDark(value); localStorage.setItem('aprender-theme', value ? 'dark' : 'light'); document.documentElement.dataset.theme = value ? 'dark' : 'light'; }
  async function refresh() {
    try {
      const data = await request('overview') as { classes: Classroom[]; users: Person[] };
      const updated = data.classes.find(item => item.id === initialClassroom.id);
      if (!updated) throw new Error('Esta turma não está mais disponível para o seu acesso.');
      setClassroom(updated); setStudents(data.users.filter(user => user.role === 'STUDENT')); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar os alunos.'); }
  }
  return <main className="class-page" aria-label="Detalhes da turma">
    <div className="class-page-navigation"><Link href="/" className="editor-back"><ArrowLeft size={18} />Voltar às turmas</Link><button className="secondary" onClick={theme} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div>
    <p className="class-page-breadcrumb">Turmas <span aria-hidden="true">/</span> Detalhes da turma</p>
    {error && <div className="error" role="alert">{error}<button className="text-button" onClick={() => { void refresh(); }}>Tentar novamente</button></div>}
    <ClassDetails classroom={classroom} users={students} onChanged={() => { void refresh(); }} />
  </main>;
}
