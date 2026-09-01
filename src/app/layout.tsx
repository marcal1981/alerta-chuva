import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alerta Chuva",
  description: "Previsão de chuva em tempo real com OpenMeteo API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
