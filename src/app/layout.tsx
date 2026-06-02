import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AR Measurement",
  description: "WebXR AR measurement app for real-world two-point distance measurement."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
