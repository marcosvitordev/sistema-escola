'use client';
import { useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, BookOpen, ClipboardList, GraduationCap, Search, UserPlus, Users } from 'lucide-react';
import { Field, Form } from './form';
import { ClassLearning } from './class-learning';
import { ClassAssessments } from './class-assessments';

type Person = { id: string; name: string; username?: string; role: string };
type Classroom = { id: string; name: string; course: { name: string; description: string }; teacher: { name: string }; enrollments: { id: string; student: Person }[] };
const sections = [
  { id: 'summary', label: 'Resumo', icon: GraduationCap },
  { id: 'students', label: 'Alunos', icon: Users },
  { id: 'lessons', label: 'Aulas e apostilas', icon: BookOpen },
  { id: 'assessments', label: 'Provas e atividades', icon: ClipboardList },
] as const;
type Section = typeof sections[number]['id'];

export function ClassDetails({ classroom, users, onChanged }: { classroom: Classroom; users: Person[]; onChanged: () => void }) {
  const [section, setSection] = useState<Section>('summary');
  const [visited, setVisited] = useState<Section[]>(['summary']);
  const [query, setQuery] = useState('');
  const [studentForm, setStudentForm] = useState<'new' | 'enroll' | null>(null);
  const [notice, setNotice] = useState('');
  const available = users.filter(user => user.role === 'STUDENT' && !classroom.enrollments.some(item => item.student.id === user.id));
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const students = classroom.enrollments.filter(({ student }) => `${student.name} ${student.username || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery));
  const tabId = (id: Section) => `class-${classroom.id}-tab-${id}`;
  const panelId = (id: Section) => `class-${classroom.id}-panel-${id}`;
  function navigate(next: Section) { setSection(next); setVisited(items => items.includes(next) ? items : [...items, next]); }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); navigate(sections[next].id); document.getElementById(tabId(sections[next].id))?.focus();
  }
  function saved(message: string) { setNotice(message); setStudentForm(null); onChanged(); }
  return <div className="class-details">
    <header className="class-details-heading"><div><span className="pill">{classroom.course.name}</span><h3>{classroom.name}</h3><p>Professor responsável: <strong>{classroom.teacher.name}</strong></p></div><span className="class-student-count"><Users size={20} /><strong>{classroom.enrollments.length}</strong> {classroom.enrollments.length === 1 ? 'aluno' : 'alunos'}</span></header>
    <div className="class-details-tabs" role="tablist" aria-label="Seções da turma">{sections.map((item, index) => <button key={item.id} id={tabId(item.id)} type="button" role="tab" aria-selected={section === item.id} aria-controls={panelId(item.id)} tabIndex={section === item.id ? 0 : -1} onClick={() => navigate(item.id)} onKeyDown={event => keyboard(event, index)}><item.icon size={18} aria-hidden="true" />{item.label}</button>)}</div>
    <section className="class-details-panel" id={panelId('summary')} role="tabpanel" aria-labelledby={tabId('summary')} hidden={section !== 'summary'} tabIndex={0}>
      <div className="class-section-intro"><h3>O que você quer fazer?</h3><p>Escolha uma seção para cuidar de cada parte da turma.</p></div>
      <div className="class-quick-actions">{sections.slice(1).map(item => <button key={item.id} onClick={() => navigate(item.id)}><span className={`class-action-icon ${item.id}`}><item.icon size={25} /></span><strong>{item.label}</strong><p>{item.id === 'students' ? 'Cadastre alunos e organize as matrículas.' : item.id === 'lessons' ? 'Crie aulas, envie PDFs e acompanhe as entregas.' : 'Prepare avaliações e corrija as respostas.'}</p><span className="class-action-link">Abrir seção <ArrowUpRight size={16} /></span></button>)}</div>
      <div className="class-workflow"><strong>Para preparar sua turma</strong><ol><li>Cadastre ou matricule os alunos.</li><li>Crie as aulas e envie as apostilas.</li><li>Publique os materiais e as avaliações.</li></ol></div>
      {classroom.course.description && <div className="class-course-description"><h4>Sobre o curso</h4><p>{classroom.course.description}</p></div>}
    </section>
    <section className="class-details-panel" id={panelId('students')} role="tabpanel" aria-labelledby={tabId('students')} hidden={section !== 'students'} tabIndex={0}>
      <div className="class-section-intro"><div><h3>Alunos da turma</h3><p>Veja quem está matriculado e adicione novos alunos.</p></div><div className="class-student-actions"><button onClick={() => { setNotice(''); setStudentForm(studentForm === 'new' ? null : 'new'); }}><UserPlus size={17} />Cadastrar aluno</button><button className="secondary" onClick={() => { setNotice(''); setStudentForm(studentForm === 'enroll' ? null : 'enroll'); }}>Matricular cadastrado</button></div></div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {studentForm && <section className="class-student-form card"><div className="section-heading"><h4>{studentForm === 'new' ? 'Cadastrar aluno nesta turma' : 'Matricular aluno já cadastrado'}</h4><button className="text-button" onClick={() => setStudentForm(null)}>Fechar formulário</button></div>{studentForm === 'new' ? <Form endpoint="users" label="Cadastrar e matricular aluno" onSuccess={() => saved('Aluno cadastrado e matriculado nesta turma.')}><input type="hidden" name="classId" value={classroom.id} /><input type="hidden" name="role" value="STUDENT" /><Field label="Nome completo do aluno" name="name" /><Field label="Usuário ou matrícula do aluno" name="username" /><Field label="Senha inicial do aluno (mínimo 4 caracteres)" name="password" type="password" minLength={4} /><p className="help">Entregue o acesso individualmente. O aluno criará sua senha pessoal no primeiro acesso.</p></Form> : available.length ? <Form endpoint="enrollments" label="Matricular nesta turma" onSuccess={() => saved('Aluno matriculado nesta turma.')}><input type="hidden" name="classId" value={classroom.id} /><label>Selecionar aluno cadastrado<select name="studentId" required><option value="">Escolha um aluno</option>{available.map(student => <option key={student.id} value={student.id}>{student.name}{student.username ? ` · ${student.username}` : ''}</option>)}</select></label></Form> : <p>Todos os alunos disponíveis já estão nesta turma. Use “Cadastrar aluno” para criar um novo acesso.</p>}</section>}
      {classroom.enrollments.length > 0 && <label className="class-student-search"><span><Search size={16} />Buscar aluno nesta turma</span><input type="search" placeholder="Nome ou matrícula" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      {!classroom.enrollments.length ? <div className="class-empty-state"><Users size={34} /><h4>Esta turma ainda não tem alunos</h4><p>Cadastre um novo aluno ou matricule alguém que já tenha acesso.</p></div> : !students.length ? <p className="class-empty-state">Nenhum aluno encontrado para esta busca.</p> : <ul className="class-roster">{students.map(({ id, student }) => <li key={id}><span className="class-roster-avatar" aria-hidden="true">{student.name.slice(0, 1)}</span><div><strong>{student.name}</strong><span>{student.username || 'Sem matrícula informada'}</span></div><span className="class-enrolled-label">Matriculado</span></li>)}</ul>}
    </section>
    <section className="class-details-panel" id={panelId('lessons')} role="tabpanel" aria-labelledby={tabId('lessons')} hidden={section !== 'lessons'} tabIndex={0}>{visited.includes('lessons') && <ClassLearning classId={classroom.id} manage showAssessmentsLink={false} />}</section>
    <section className="class-details-panel" id={panelId('assessments')} role="tabpanel" aria-labelledby={tabId('assessments')} hidden={section !== 'assessments'} tabIndex={0}>{visited.includes('assessments') && <ClassAssessments classId={classroom.id} embedded />}</section>
  </div>;
}
