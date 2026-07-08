import ForecastSection from "./ForecastSection";
import VerifyList from "./VerifyList";

export default function ForecastPage() {
  return (
    <main className="p-10 font-sans">
      <h1 className="text-2xl font-semibold mb-6">Forecast</h1>
      <div className="flex flex-col md:flex-row gap-10">
        <div className="flex-1 min-w-[320px]">
          <ForecastSection
            title="Sales forecast"
            apiBase="sales"
            categoryField="product_line"
            categoryOptions={["gmax_ci", "residential"]}
          />
          <VerifyList apiBase="sales" />
        </div>
        <div className="flex-1 min-w-[320px]">
          <ForecastSection title="Purchase forecast" apiBase="purchase" categoryField="category" />
          <VerifyList apiBase="purchase" />
        </div>
      </div>
    </main>
  );
}
