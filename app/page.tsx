import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";
import { PLAN_DETAILS, PLAN_ORDER } from "@/lib/constants";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-xl font-bold tracking-tight">
          Coledia <span className="text-primary">Controlcenter</span>
        </span>
        <div className="flex gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants()}>
            Get started
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-16 py-16">
        <section className="flex flex-col items-center gap-4 text-center">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Your Coledia community platform, under your control
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Create your own Coledia container in minutes: pick a plan, choose your
            look, claim your subdomain — we handle the rest.
          </p>
          <div className="mt-2 flex gap-3">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Create your container
            </Link>
            <Link href="/sign-in" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {PLAN_ORDER.map((plan) => (
            <div key={plan} className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">{PLAN_DETAILS[plan].name}</h3>
              <p className="mt-1 text-2xl font-bold">
                CHF {PLAN_DETAILS[plan].priceChf}
                <span className="text-sm font-normal text-muted-foreground"> /month</span>
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
                {PLAN_DETAILS[plan].features.slice(0, 4).map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        Coledia Controlcenter — a product of Wiesmann Solutions Engineering
      </footer>
    </div>
  );
}
