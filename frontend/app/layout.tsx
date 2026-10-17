import './globals.css';
import Script from 'next/script';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ALGIONS Retail Mart | Component-Based Local Commerce',
  description: 'Next.js storefront powered by secure Express and Razorpay backend'
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
