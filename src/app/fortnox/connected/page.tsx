export default function FortnoxConnectedPage() {
  return (
    <main className="p-10 font-sans">
      <h1 className="text-xl font-semibold">Fortnox connected</h1>
      <p className="mt-2">
        Tokens were stored successfully. Test the connection at{" "}
        <a className="underline" href="/api/fortnox/test">
          /api/fortnox/test
        </a>
        .
      </p>
    </main>
  );
}
