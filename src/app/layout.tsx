import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/components/cart-provider";
import { CustomerOrderingGuide } from "@/components/customer-ordering-guide";
import { getRestaurantSettings } from "@/lib/restaurant-data";
import { getMetadataBase } from "@/lib/site";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const { restaurant } = await getRestaurantSettings();

  return {
    metadataBase: getMetadataBase(),
    title: {
      default: restaurant.name,
      template: `%s | ${restaurant.name}`,
    },
    description: restaurant.description ?? "Restaurant information and current menu.",
    openGraph: {
      title: restaurant.name,
      description: restaurant.description ?? "Restaurant information and current menu.",
      siteName: restaurant.name,
      locale: "en_US",
      type: "website",
      ...(restaurant.coverImageUrl ? { images: [restaurant.coverImageUrl] } : {}),
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const customer = await getCurrentCustomer();

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <CartProvider>
          {children}
          <CustomerOrderingGuide customerId={customer?.id ?? null} />
        </CartProvider>
      </body>
    </html>
  );
}
