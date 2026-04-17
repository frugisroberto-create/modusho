import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Previene clickjacking: l'app non può essere caricata in un iframe
          { key: "X-Frame-Options", value: "DENY" },
          // Previene MIME sniffing: il browser rispetta il Content-Type dichiarato
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Controlla quante info vengono inviate nel Referer header
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Blocca accesso a microfono, camera, geolocalizzazione, etc.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Content-Security-Policy: limita le origini di script, stili, immagini, connessioni
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.amazonaws.com",
              "connect-src 'self' https://*.neon.tech https://*.amazonaws.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
