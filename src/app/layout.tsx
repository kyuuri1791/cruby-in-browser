import type { Metadata } from "next";
import AboutDialog from "./components/AboutDialog";
import SiteTitle from "./components/SiteTitle";
import "./globals.css";

export const metadata: Metadata = {
  title: "ブラウザで CRuby",
  description: "CRuby の C のソースを書き換え、ブラウザの中でビルドして実行する。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <SiteTitle />
          <nav>
            <AboutDialog />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
