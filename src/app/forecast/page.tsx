import ForecastSection from "./ForecastSection";

export default function ForecastPage() {
  return (
    <main className="p-10 font-sans">
      <h1 className="text-2xl font-semibold mb-6">Forecast</h1>
      <div className="flex flex-col md:flex-row gap-10">
        <ForecastSection
          title="Sales forecast"
          apiBase="sales"
          categoryField="product_line"
          categoryOptions={["gmax_ci", "residential"]}
        />
        <ForecastSection title="Purchase forecast" apiBase="purchase" categoryField="category" />
      </div>
    </main>
  );
}
