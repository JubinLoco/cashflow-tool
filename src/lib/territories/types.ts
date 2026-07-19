export type ProvinceFeature = {
  type: "Feature";
  properties: { name: string; lanskod: string };
  geometry: GeoJSON.Geometry;
};

export type ProvincesGeoJSON = {
  type: "FeatureCollection";
  features: ProvinceFeature[];
};

export type MarketSize = {
  province: string;
  solar: number;
  battery: number;
  evCharger: number;
  total: number;
};

// Tier ids are open-ended (the tier rules editor lets users add/rename tiers), so this is
// a plain string, not a fixed union -- "village"/"metropolis"/etc. are just the defaults.
export type SettlementTier = string;

export type Settlement = {
  customerNumber: string;
  name: string;
  province: string | null;
  city: string | null;
  trailing12moTurnover: number;
  marginPct: number | null;
  monthsWithData: number;
  tier: SettlementTier;
};

export type CompetitorStatus = "active" | "passive" | "exited" | "bankrupt";

export type Competitor = {
  id: string;
  displayName: string;
  legalNote?: string;
  status: CompetitorStatus;
  statusNote?: string;
  revenueEstimateSEK?: number;
  revenueYear?: number | string;
  revenueTrend?: string;
  hq?: string;
  province?: string;
  productFocus?: string[];
  confidence?: string;
};

export type DisintermediationThreat = {
  id: string;
  displayName: string;
  legalNote?: string;
  status: CompetitorStatus;
  confidence?: string;
};

export type CompetitorRoster = {
  player: { id: string; name: string };
  empires: Competitor[];
  disintermediation_threats: {
    description: string;
    members: DisintermediationThreat[];
  };
};
