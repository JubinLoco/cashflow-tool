export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-10 font-sans">
      <h1 className="text-2xl font-semibold">Cashflow Tool</h1>
      <a className="underline" href="/api/fortnox/connect">
        Connect to Fortnox
      </a>
      <a className="underline" href="/forecast">
        Forecast
      </a>
    </main>
  );
}
