import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "Northstar Bank | Smarter Banking for Business",
  description:
    "Manage accounts, payments, transfers and financial activities through one secure, convenient banking platform.",
  openGraph: {
    title: "Northstar Bank | Smarter Banking for Business",
    description:
      "A clearer way to manage accounts, banking activities and statements.",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
