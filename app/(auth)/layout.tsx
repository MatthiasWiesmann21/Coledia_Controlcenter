import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center gap-2">
        <span className="text-2xl font-bold tracking-tight">
          Coledia <span className="text-primary">Controlcenter</span>
        </span>
        <span className="text-sm text-muted-foreground">
          Manage your containers &amp; subscription
        </span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
