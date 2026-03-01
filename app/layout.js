import "./globals.css";

export const metadata = {
  title: "Pili Gasul Tracker",
  description: "LPG Inventory & Sales Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
