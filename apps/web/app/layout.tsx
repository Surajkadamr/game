import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KADAM Poker — Premium No-Limit Texas Hold\'em',
  description: 'World-class online poker room. Play No-Limit Texas Hold\'em with real-time multiplayer.',
  keywords: ['poker', 'texas holdem', 'no limit', 'multiplayer', 'online poker'],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>♠</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="bg-casino-bg text-white font-ui overflow-hidden">
        {children}
        <Toaster
          position="top-right"
          gutter={8}
          containerStyle={{ top: 80 }}
          toastOptions={{
            duration: 3000,
            style: {
              background: 'rgba(13, 17, 23, 0.95)',
              color: '#f8f4e8',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              fontFamily: 'var(--font-inter)',
              fontSize: '14px',
              backdropFilter: 'blur(20px)',
            },
          }}
        />
      </body>
    </html>
  );
}
