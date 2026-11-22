import type { Metadata } from "next";
import Script from "next/script";
import { StoreProvider } from "@/store/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northstar Bank | Digital Banking",
  description: "A modern digital banking management experience.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <StoreProvider>{children}</StoreProvider>
        <Script id="northstar-dashboard-theme-init" strategy="beforeInteractive">
          {'(function(){try{var t=localStorage.getItem("northstar-dashboard-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()'}
        </Script>
      </body>
    </html>
  );
}
