import type { Metadata, Viewport } from "next";
import { Figtree, Inter } from "next/font/google";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppShell from "@/components/layout/AppShell";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Títulos: Figtree é a gratuita mais próxima da Area Normal do manual da marca.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Leads`,
  description: "Painel de gestão de leads e performance da HealthGo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Aplica o tema salvo antes da pintura, evitando flash de tela clara.
const themeScript = `(function(){try{var t=localStorage.getItem('app-theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
