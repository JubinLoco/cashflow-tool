"use client";

import { useState } from "react";
import ForecastSection from "./ForecastSection";
import VerifyList from "./VerifyList";
import SyncButton from "./SyncButton";

export default function ForecastPage() {
  const [salesRefresh, setSalesRefresh] = useState(0);
  const [purchaseRefresh, setPurchaseRefresh] = useState(0);

  return (
    <main className="p-10 font-sans">
      <h1 className="text-2xl font-semibold mb-6">Forecast</h1>
      <SyncButton />
      <div className="flex flex-col md:flex-row gap-10">
        <div className="flex-1 min-w-[320px]">
          <ForecastSection
            title="Sales forecast"
            apiBase="sales"
            categoryField="product_line"
            categoryOptions={["gmax_ci", "residential", "consultancy"]}
            onAdded={() => setSalesRefresh((n) => n + 1)}
          />
          <VerifyList apiBase="sales" refreshSignal={salesRefresh} />
        </div>
        <div className="flex-1 min-w-[320px]">
          <ForecastSection
            title="Purchase forecast"
            apiBase="purchase"
            categoryField="category"
            onAdded={() => setPurchaseRefresh((n) => n + 1)}
          />
          <VerifyList apiBase="purchase" refreshSignal={purchaseRefresh} />
        </div>
      </div>
    </main>
  );
}
