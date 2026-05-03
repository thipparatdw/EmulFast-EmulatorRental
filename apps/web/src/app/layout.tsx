// Root layout provides document shell. lang is set per-locale by [locale]/layout.tsx
// via a data attribute; html lang defaults to "th" here.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
