'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ClassDetails, type Classroom, type Person } from './class-details';
import { ManagementShell, type ManagementUser } from './management-shell';
import { request } from './form';

export function ClassPage({ initialClassroom, initialStudents, user }: { user: ManagementUser; initialClassroom: Classroom; initialStudents: Person[] }) {
  const [classroom, setClassroom] = useState(initialClassroom);
  const [students, setStudents] = useState(initialStudents);
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const data = await request('overview') as { classes: Classroom[]; users: Person[] };
      const updated = data.classes.find(item => item.id === initialClassroom.id);
      if (!updated) throw new Error('Esta turma não está mais disponível para o seu acesso.');
      setClassroom(updated); setStudents(data.users.filter(user => user.role === 'STUDENT')); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar os alunos.'); }
  }
  return <ManagementShell user={user} active="classes" title={<><Link href="/?painel=classes">Turmas</Link><span className="slash">/</span><span>{classroom.name}</span></>}><main className="content class-page class-page-in-shell" aria-label="Detalhes da turma">
    {error && <div className="error" role="alert">{error}<button className="text-button" onClick={() => { void refresh(); }}>Tentar novamente</button></div>}
    <ClassDetails classroom={classroom} users={students} onChanged={() => { void refresh(); }} />
  </main></ManagementShell>;
}
