'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ClipboardList, FileText, GraduationCap, HelpCircle, Home, KeyRound, LogOut, MessageCircle, Moon, Play, RefreshCw, Search, Sun, UserRound, X } from 'lucide-react';
import { assessmentState, materialState, type StudentArea, type StudentAssessment, type StudentClass, type StudentHomeData, type StudentIdentity, type StudentMaterial } from '@/lib/student-home-types';
import { Field, Form, request } from './form';

const navigation = [
  { id: 'inicio', label: 'Meu início', mobile: 'Início', icon: Home },
  { id: 'apostilas', label: 'Apostilas', mobile: 'Apostilas', icon: BookOpen },
  { id: 'atividades', label: 'Provas e atividades', mobile: 'Avaliações', icon: ClipboardList },
  { id: 'correcoes', label: 'Minhas correções', mobile: 'Correções', icon: MessageCircle },
] as const;

export function StudentWorkspace({ user, initialArea = 'inicio', initialClassId = 'all' }: { user: StudentIdentity; initialArea?: StudentArea; initialClassId?: string }) {
  const [area, setArea] = useState<StudentArea>(initialArea);
  const [classId, setClassId] = useState(initialClassId);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<StudentHomeData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [dark, setDark] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const account = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try { const next = localStorage.getItem('aprender-theme') === 'dark'; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'; } catch { /* The selected theme can still be changed for this visit. */ }
  }, []);
  useEffect(() => {
    if (user.mustChangePassword) return;
    let active = true; let pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return; pending = true; setBusy(true);
      try {
        const response = await fetch('/api/student/home', { cache: 'no-store', signal: controller.signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        if (active) { setData(result); setError(''); }
      } catch (e) { if (active && !(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Verifique sua conexão e tente novamente.'); }
      finally { pending = false; if (active) setBusy(false); }
    }
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const interval = setInterval(refresh, 30_000); window.addEventListener('focus', refresh);
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [user.mustChangePassword, reload]);
  function theme() { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'; try { localStorage.setItem('aprender-theme', next ? 'dark' : 'light'); } catch { /* No persistence is required to use the theme. */ } }
  async function logout() { setError(''); try { await request('logout', {}); window.location.assign('/'); } catch { setError('Não foi possível sair. Tente novamente.'); } }
  function navigate(next: StudentArea) { setArea(next); setQuery(''); if (account.current) account.current.open = false; window.scrollTo({ top: 0 }); }
  const classes = data?.classes || [];
  const selectedClass = classes.find(c => c.id === classId);
  const currentClassId = selectedClass?.id || 'all';
  const materials = (data?.materials || []).filter(item => currentClassId === 'all' || item.classId === currentClassId);
  const assessments = (data?.assessments || []).filter(item => currentClassId === 'all' || item.classId === currentClassId);
  const total = materials.length + assessments.length;
  const delivered = materials.filter(m => m.work?.submittedAt).length + assessments.filter(a => a.attempts.some(t => t.submittedAt)).length;
  const allDelivered = total > 0 && delivered === total;
  const materialReviews = materials.filter(m => m.work?.feedback);
  const assessmentReviews = assessments.filter(a => a.gradesReleased && a.attempts.some(t => t.submittedAt && t.gradedAt));
  const corrections = materialReviews.length + assessmentReviews.length;
  const inProgress = [
    ...materials.filter(m => m.work && m.work.version > 0 && !m.work.submittedAt).map(m => ({ id: m.id, title: m.title, lesson: m.lessonTitle, kind: 'Apostila', href: materialState(m).href, action: 'Continuar apostila', updated: m.work!.updatedAt })),
    ...assessments.filter(a => !a.dueAt || new Date(a.dueAt).getTime() >= Date.now()).flatMap(a => a.attempts.filter(t => !t.submittedAt).map(t => ({ id: t.id, title: a.title, lesson: a.lessonTitle, kind: a.kind === 'TEST' ? 'Prova' : 'Atividade', href: `/atividades/${a.id}?tentativa=${t.id}`, action: a.kind === 'TEST' ? 'Continuar prova' : 'Continuar atividade', updated: t.updatedAt }))),
  ].sort((a, b) => b.updated.localeCompare(a.updated));
  const untouched = materials.find(m => !m.work?.submittedAt);
  const pendingAssessment = [...assessments].filter(a => !a.attempts.some(t => t.submittedAt) && (!a.dueAt || new Date(a.dueAt).getTime() >= Date.now())).sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999'))[0];
  const next = inProgress[0] || (pendingAssessment ? { id: pendingAssessment.id, title: pendingAssessment.title, lesson: pendingAssessment.lessonTitle, kind: pendingAssessment.kind === 'TEST' ? 'Prova' : 'Atividade', href: `/atividades/${pendingAssessment.id}`, action: pendingAssessment.kind === 'TEST' ? 'Abrir prova' : 'Abrir atividade' } : untouched ? { id: untouched.id, title: untouched.title, lesson: untouched.lessonTitle, kind: 'Apostila', href: `/apostilas/${untouched.id}`, action: 'Abrir apostila' } : null);
  const search = query.trim().toLocaleLowerCase('pt-BR');
  const filteredMaterials = materials.filter(m => `${m.title} ${m.lessonTitle} ${m.module}`.toLocaleLowerCase('pt-BR').includes(search));
  const filteredAssessments = assessments.filter(a => `${a.title} ${a.lessonTitle} ${a.kind === 'TEST' ? 'prova' : 'atividade'}`.toLocaleLowerCase('pt-BR').includes(search));

  return <div className="student-area"><a className="student-skip" href="#student-content">Ir para o conteúdo</a>
    <header className="student-header"><div className="student-header-inner">
      <Link className="student-brand" href="/" aria-label="Aprender — meu início" onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { navigate('inicio'); setClassId('all'); } }}><span><BookOpen size={27} /></span>aprender</Link>
      <span className="student-school"><GraduationCap size={18} />{user.institution}</span>
      <details ref={account} className="student-account"><summary><UserRound size={19} /><span>Minha conta</span><ChevronDown size={15} /></summary><div className="student-account-menu"><strong>{user.name}</strong><button onClick={theme}>{dark ? <Sun size={18} /> : <Moon size={18} />}{dark ? 'Usar tema claro' : 'Usar tema escuro'}</button><button onClick={() => { if (account.current) account.current.open = false; dialog.current?.showModal(); }}><KeyRound size={18} />Alterar senha</button><button onClick={logout}><LogOut size={18} />Sair da plataforma</button></div></details>
    </div></header>
    {!user.mustChangePassword && <nav className="student-nav" aria-label="Menu do aluno"><div>{navigation.map(item => <button key={item.id} aria-pressed={area === item.id} onClick={() => navigate(item.id)}><item.icon size={20} /><span className="student-nav-label">{item.label}</span><span className="student-nav-mobile">{item.mobile}</span>{item.id === 'correcoes' && corrections > 0 && <span className="student-nav-count">{corrections}</span>}</button>)}</div></nav>}
    <main className="student-main" id="student-content" tabIndex={-1}>
      {user.mustChangePassword ? <section className="student-first-access"><span className="student-icon green"><KeyRound size={27} /></span><h1>Olá, {user.name.split(' ')[0]}!</h1><h2>Vamos criar sua senha pessoal?</h2><p>Digite a senha inicial que seu professor entregou e escolha uma nova senha só sua.</p><StudentPassword onSuccess={() => window.location.reload()} /><p className="student-help-text">Se precisar de ajuda, chame seu professor.</p></section> : <>
        <div className="student-page-intro"><div><span className="student-kicker">SEU ESPAÇO DE APRENDIZAGEM</span><h1>{area === 'inicio' ? `Olá, ${user.name.split(' ')[0]}!` : area === 'apostilas' ? 'Minhas apostilas' : area === 'atividades' ? 'Provas e atividades' : 'Minhas correções'}</h1><p>{area === 'inicio' ? 'Tudo o que você precisa para a aula está aqui.' : area === 'apostilas' ? 'Abra a apostila e escreva suas respostas na própria página.' : area === 'atividades' ? 'Veja o que precisa fazer e continue suas respostas.' : 'Veja as notas e as orientações que seu professor deixou.'}</p></div><button className="student-refresh" disabled={busy} onClick={() => setReload(n => n + 1)}><RefreshCw size={17} />Atualizar</button></div>
        {error && <p className="error" role="alert">{error}</p>}
        {!data && !error && <div className="student-loading" role="status"><BookOpen size={28} /><p>Estamos preparando seus materiais…</p></div>}
        {data && <>
          {classes.length > 1 ? <label className="student-class-filter">Minha turma<select value={currentClassId} onChange={e => setClassId(e.target.value)}><option value="all">Todas as minhas turmas</option>{classes.map(c => <option value={c.id} key={c.id}>{c.name} · {c.course}</option>)}</select></label> : classes[0] && <div className="student-class-label"><GraduationCap size={19} /><strong>{classes[0].course}</strong><span>· {classes[0].name}</span><small>Professor: {classes[0].teacher}</small></div>}
          {!classes.length ? <StudentEmpty icon={GraduationCap} title="Sua turma vai aparecer aqui" text="Seu professor ainda precisa realizar sua matrícula. Peça ajuda a ele para começar." /> : <>
          {area === 'inicio' && <>
            <section className="student-shortcuts" aria-label="Acessos rápidos"><button className="student-shortcut materials" onClick={() => navigate('apostilas')}><span className="student-icon blue"><BookOpen size={29} /></span><div><h2>Minhas apostilas</h2><p>Ler, responder e continuar de onde parou.</p><strong>{materials.length} {materials.length === 1 ? 'apostila disponível' : 'apostilas disponíveis'}</strong></div><ArrowRight size={21} /></button><button className="student-shortcut activities" onClick={() => navigate('atividades')}><span className="student-icon amber"><ClipboardList size={29} /></span><div><h2>Provas e atividades</h2><p>Responder e entregar para seu professor.</p><strong>{assessments.length} {assessments.length === 1 ? 'avaliação disponível' : 'avaliações disponíveis'}</strong></div><ArrowRight size={21} /></button></section>
            <div className="student-home-columns"><section className="student-next"><span className="student-kicker">{inProgress.length ? 'CONTINUE DE ONDE PAROU' : next ? 'SEU PRÓXIMO PASSO' : allDelivered ? 'VOCÊ ESTÁ EM DIA' : total ? 'CONFIRA SUAS ATIVIDADES' : 'VAMOS APRENDER JUNTOS'}</span>{next ? <><span className="student-next-type">{next.kind}</span><h2>{next.title}</h2><p>{next.lesson}</p><Link className="student-primary" href={next.href}><Play size={18} />{next.action}<ArrowRight size={17} /></Link><small>Suas respostas são salvas enquanto você escreve.</small></> : <><span className="student-icon green">{allDelivered ? <CheckCircle2 size={30} /> : <BookOpen size={30} />}</span><h2>{allDelivered ? 'Tudo entregue por aqui!' : total ? 'Vamos conferir suas atividades?' : 'Seus materiais vão aparecer aqui'}</h2><p>{allDelivered ? 'Você pode rever as apostilas ou consultar suas correções quando quiser.' : total ? 'Há avaliações com prazo encerrado. Consulte seu professor para saber como continuar.' : 'Seu professor está preparando as aulas. Quando publicar, você verá os materiais neste espaço.'}</p><button className="student-outline" onClick={() => navigate(allDelivered ? 'correcoes' : total ? 'atividades' : 'apostilas')}>{allDelivered ? 'Ver minhas correções' : total ? 'Ver minhas avaliações' : 'Ver apostilas'}<ArrowRight size={17} /></button></> }</section>
              <section className="student-progress"><div><span className="student-icon green"><CheckCircle2 size={23} /></span><h2>Seu progresso</h2></div>{total ? <><strong>{delivered}<span> de {total}</span></strong><p>materiais e avaliações entregues</p><progress aria-label="Materiais e avaliações entregues" value={delivered} max={total} /><small>Um passo de cada vez. Você está construindo seu aprendizado.</small></> : <p>Quando os materiais forem publicados, você poderá acompanhar suas entregas aqui.</p>}<button className="student-review-link" onClick={() => navigate('correcoes')}><MessageCircle size={19} /><span>{corrections ? `${corrections} ${corrections === 1 ? 'correção disponível' : 'correções disponíveis'}` : 'Minhas correções'}</span><ArrowRight size={16} /></button></section></div>
            <section className="student-recent"><div className="student-section-heading"><div><h2>Materiais da sua turma</h2><p>Escolha uma apostila para acompanhar a aula.</p></div>{materials.length > 3 && <button onClick={() => navigate('apostilas')}>Ver todas<ArrowRight size={17} /></button>}</div>{materials.length ? <div className="student-resource-grid">{materials.slice(0, 3).map(m => <MaterialCard key={m.id} item={m} classroom={classes.find(c => c.id === m.classId)} />)}</div> : <StudentEmpty icon={BookOpen} title="Nenhuma apostila publicada ainda" text="Assim que o professor publicar uma apostila, você poderá abri-la aqui." compact />}</section>
          </>}
          {(area === 'apostilas' || area === 'atividades') && <><div className="student-list-tools"><label className="student-search"><Search size={19} /><input aria-label={area === 'apostilas' ? 'Buscar apostila ou aula' : 'Buscar prova ou atividade'} placeholder={area === 'apostilas' ? 'Buscar apostila ou aula' : 'Buscar prova ou atividade'} value={query} onChange={e => setQuery(e.target.value)} /></label><span>{area === 'apostilas' ? filteredMaterials.length : filteredAssessments.length} {area === 'apostilas' ? 'apostila(s)' : 'avaliação(ões)'}</span></div>{area === 'apostilas' ? filteredMaterials.length ? <div className="student-resource-grid">{filteredMaterials.map(m => <MaterialCard key={m.id} item={m} classroom={classes.find(c => c.id === m.classId)} />)}</div> : <StudentEmpty icon={BookOpen} title={query ? 'Não encontramos essa apostila' : 'Nenhuma apostila publicada ainda'} text={query ? 'Tente buscar pelo nome da aula ou por outra palavra.' : 'As apostilas aparecerão aqui quando seu professor publicar.'} /> : filteredAssessments.length ? <div className="student-resource-grid">{filteredAssessments.map(a => <AssessmentCard key={a.id} item={a} classroom={classes.find(c => c.id === a.classId)} />)}</div> : <StudentEmpty icon={ClipboardList} title={query ? 'Não encontramos essa avaliação' : 'Nenhuma prova ou atividade publicada ainda'} text={query ? 'Tente buscar pelo título ou pelo nome da aula.' : 'Seu professor avisará quando houver uma nova avaliação. Você também poderá encontrá-la aqui.'} />}</>}
          {area === 'correcoes' && (corrections ? <div className="student-resource-grid">{materialReviews.map(m => <MaterialCard key={m.id} item={m} classroom={classes.find(c => c.id === m.classId)} review />)}{assessmentReviews.map(a => <AssessmentCard key={a.id} item={a} classroom={classes.find(c => c.id === a.classId)} review />)}</div> : <StudentEmpty icon={MessageCircle} title="Suas correções vão aparecer aqui" text="Depois da entrega, aguarde a correção e a liberação da nota pelo professor." />)}
          </>}
        </>}
        <aside className="student-help"><HelpCircle size={22} /><div><strong>Precisa de uma ajudinha?</strong><p>Chame seu professor. Ele pode ajudar você a abrir a apostila, responder às atividades ou recuperar sua senha.</p></div></aside>
      </>}
    </main><footer className="student-footer"><BookOpen size={17} />Aprender · Cada aula, uma nova conquista.</footer>
    <dialog ref={dialog} className="modal student-password-modal" aria-labelledby="student-password-title"><div className="modal-top"><h2 id="student-password-title">Alterar minha senha</h2><button className="icon-button" aria-label="Fechar janela" onClick={() => dialog.current?.close()}><X size={21} /></button></div><StudentPassword onSuccess={() => window.location.reload()} /></dialog>
  </div>;
}

function StudentPassword({ onSuccess }: { onSuccess: () => void }) { return <Form endpoint="password" label="Salvar minha nova senha" onSuccess={onSuccess}><label>Senha atual<input name="current" type="password" autoComplete="current-password" maxLength={128} required /></label><Field label="Nova senha (pelo menos 4 caracteres)" name="password" type="password" minLength={4} /></Form>; }
function MaterialCard({ item, classroom, review = false }: { item: StudentMaterial; classroom?: StudentClass; review?: boolean }) {
  const state = materialState(item);
  return <article className="student-resource"><div className="student-resource-top"><span className="student-icon blue"><FileText size={25} /></span><span className={`student-status ${review ? 'review' : state.tone}`}>{review ? <MessageCircle size={13} /> : state.tone === 'done' ? <Check size={13} /> : null}{review ? 'Correção disponível' : state.label}</span></div><span className="student-resource-kind">APOSTILA · {item.pageCount} {item.pageCount === 1 ? 'PÁGINA' : 'PÁGINAS'}</span><h2>{item.title}</h2><p>{item.lessonTitle}</p>{classroom && <small>{classroom.course} · {classroom.name}</small>}{review && item.work?.feedback && <div className="student-card-note">{item.work.feedback.grade !== null ? `Nota: ${item.work.feedback.grade.toLocaleString('pt-BR')} / 10` : 'Seu professor deixou uma orientação.'}</div>}<Link className="student-resource-action" aria-label={`${review ? 'Ver correção' : state.action}: ${item.title}`} href={review ? `/apostilas/${item.id}#correcao` : state.href}>{review ? 'Ver correção' : state.action}<ArrowRight size={18} /></Link></article>;
}
function AssessmentCard({ item, classroom, review = false }: { item: StudentAssessment; classroom?: StudentClass; review?: boolean }) {
  const state = assessmentState(item); const corrected = item.attempts.find(t => t.submittedAt && t.gradedAt);
  return <article className="student-resource"><div className="student-resource-top"><span className="student-icon amber"><ClipboardList size={25} /></span><span className={`student-status ${review ? 'review' : state.tone}`}>{review ? 'Correção disponível' : state.label}</span></div><span className="student-resource-kind">{item.kind === 'TEST' ? 'PROVA' : 'ATIVIDADE'} · {item.questionCount} {item.questionCount === 1 ? 'QUESTÃO' : 'QUESTÕES'}</span><h2>{item.title}</h2><p>{item.lessonTitle}</p>{classroom && <small>{classroom.course} · {classroom.name}</small>}<div className="student-card-note">{review ? 'Confira sua nota e as orientações do professor.' : item.dueAt ? `Entregar até ${new Date(item.dueAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Sem prazo de entrega definido.'}</div><Link className="student-resource-action" aria-label={`${review ? 'Ver correção' : state.action}: ${item.title}`} href={review && corrected ? `/atividades/${item.id}?tentativa=${corrected.id}` : state.href}>{review ? 'Ver correção' : state.action}<ArrowRight size={18} /></Link></article>;
}
function StudentEmpty({ title, text, icon: Icon, compact = false }: { title: string; text: string; icon: typeof BookOpen; compact?: boolean }) { return <div className={`student-empty ${compact ? 'compact' : ''}`}><span className="student-icon green"><Icon size={29} /></span><h2>{title}</h2><p>{text}</p></div>; }
