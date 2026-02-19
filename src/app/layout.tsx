import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Simulador de Fusões Municipais — Brasil",
  description:
    "Visualize o potencial de economia com fusões de municípios brasileiros. Simulação baseada em dados do Tesouro Nacional (SICONFI/FINBRA) e IBGE.",
  openGraph: {
    title: "Simulador de Fusões Municipais — Brasil",
    description:
      "Mapa comparativo: divisão atual vs. configuração otimizada de fusões municipais.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}
      >
        {children}
      </body>
    </html>
  );
}
