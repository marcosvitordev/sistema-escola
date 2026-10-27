'use client';
import { useState } from 'react';
import { BookOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import { Field, Form } from './form';
export function Access() {
  const [setup, setSetup] = useState(false);
  return <main className="access"><section className="access-story"><div className="brand"><BookOpen size={30} /> aprender<span>ESPAÇO EDUCACIONAL</span></div><div><span className="eyebrow">ENSINAR. PRATICAR. EVOLUIR.</span><h1>Conhecimento que<br />acompanha você.</h1><p>Um espaço para conectar professores, organizar turmas e construir novas possibilidades de aprendizagem.</p><div className="story-note"><ShieldCheck /><span>Acesso individual.<br /><strong>Uma jornada para cada aluno.</strong></span></div></div><small>Plataforma educacional · Primeiros passos</small></section><section className="access-form"><div className="access-inner"><span className="pill">Bem-vindo ao Aprender</span><h2>{setup ? 'Prepare seu espaço' : 'Vamos continuar aprendendo?'}</h2><p>{setup ? 'Instale a plataforma e crie a primeira conta de administrador.' : 'Entre com os dados fornecidos pela sua instituição.'}</p><Form key={String(setup)} endpoint={setup ? 'setup' : 'login'} label={setup ? 'Criar instituição e começar' : 'Entrar na plataforma →'} onSuccess={() => window.location.reload()} transform={data => setup ? { ...data, role: 'ADMIN' } : data}>
      {setup && <><Field label="Nome da instituição" name="institution" /><Field label="Seu nome completo" name="name" /><Field label="Código de instalação" name="token" type="password" /></>}
      <Field label="Código da instituição" name={setup ? 'slug' : 'institution'} placeholder="Ex.: escola-centro" />
      <Field label={setup ? 'Usuário do administrador' : 'Usuário ou matrícula'} name="username" placeholder="Seu nome de usuário" />
      <label>Senha<input name="password" required type="password" maxLength={128} minLength={setup ? 10 : undefined} autoComplete={setup ? 'new-password' : 'current-password'} /></label>
    </Form><p className="help">Precisa recuperar seu acesso? Procure seu professor ou administrador.</p><button className="text-button" onClick={() => setSetup(!setup)}>{setup ? 'Voltar para o login' : 'Primeiro acesso da instituição'}<ArrowRight size={15} /></button></div></section></main>;
}
