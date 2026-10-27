'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="access"><section className="card"><h1>Não foi possível abrir a plataforma</h1><p>Verifique se o banco de dados está disponível e tente novamente.</p><button onClick={reset}>Tentar novamente</button></section></main>;
}
