import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Together — Watch together",
  description: "A cinematic room to watch videos, share your screen, and talk together.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
