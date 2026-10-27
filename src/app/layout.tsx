import type { Metadata } from 'next';
import './globals.css';
import './editor.css';
import './assessments.css';
import './student.css';
export const metadata: Metadata = { title: 'Aprender · Plataforma educacional', description: 'Seu espaço de ensino e aprendizagem.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
