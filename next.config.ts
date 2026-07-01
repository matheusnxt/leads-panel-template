import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a todas as respostas
const securityHeaders = [
  // Bloqueia o site de ser embutido em iframes (anti-clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o navegador de "adivinhar" tipos de arquivo (anti-MIME-sniffing)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não vaza a URL completa ao navegar para outros sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Força HTTPS por 2 anos (inclui subdomínios)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Desliga APIs sensíveis do navegador que o app não usa
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
