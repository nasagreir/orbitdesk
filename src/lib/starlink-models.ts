export type StarlinkModelId =
  | "standard-gen3"
  | "standard-gen2"
  | "mini"
  | "high-performance"
  | "flat-high-performance";

export interface StarlinkModel {
  id: StarlinkModelId;
  name: string;
  shortName: string;
  description: string;
  imageSrc: string;
  supportsRoam: boolean;
  formFactor: "compact" | "standard" | "performance";
}

export const STARLINK_MODELS: StarlinkModel[] = [
  {
    id: "mini",
    name: "Starlink Mini",
    shortName: "Mini",
    description: "Portable square dish — best for travel and roam",
    imageSrc: "/starlink-models/mini.jpg",
    supportsRoam: true,
    formFactor: "compact",
  },
  {
    id: "standard-gen3",
    name: "Standard (Gen 3)",
    shortName: "Gen 3",
    description: "Current rectangular residential kit",
    imageSrc: "/starlink-models/standard-gen3.jpg",
    supportsRoam: false,
    formFactor: "standard",
  },
  {
    id: "standard-gen2",
    name: "Standard (Gen 2)",
    shortName: "Gen 2",
    description: "Circular dish on rectangular base",
    imageSrc: "/starlink-models/standard-gen2.jpg",
    supportsRoam: false,
    formFactor: "standard",
  },
  {
    id: "high-performance",
    name: "High Performance",
    shortName: "HP",
    description: "Larger high-throughput dish",
    imageSrc: "/starlink-models/high-performance.jpg",
    supportsRoam: false,
    formFactor: "performance",
  },
  {
    id: "flat-high-performance",
    name: "Flat High Performance",
    shortName: "Flat HP",
    description: "Low-profile performance dish for vehicles",
    imageSrc: "/starlink-models/flat-high-performance.jpg",
    supportsRoam: false,
    formFactor: "performance",
  },
];

export function getStarlinkModel(
  id: StarlinkModelId | undefined | null,
): StarlinkModel | undefined {
  if (!id) return undefined;
  return STARLINK_MODELS.find((m) => m.id === id);
}

export function isStarlinkModelId(value: string): value is StarlinkModelId {
  return STARLINK_MODELS.some((m) => m.id === value);
}
