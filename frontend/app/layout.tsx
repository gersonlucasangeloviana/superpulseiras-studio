import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'SuperPulseiras · Studio', description: 'Transforme referências e ideias em artes de pulseiras.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
