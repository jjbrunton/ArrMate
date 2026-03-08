export const INSTANCE_TYPE_VALUES = ["sonarr", "radarr", "overseerr"] as const;

export type InstanceType = (typeof INSTANCE_TYPE_VALUES)[number];
export type ArrInstanceType = Extract<InstanceType, "sonarr" | "radarr">;

export interface InstanceDefinition {
  type: InstanceType;
  label: string;
  baseUrlPlaceholder: string;
  defaultName: string;
  supportsQueue: boolean;
  supportsIssues: boolean;
  supportsQuality: boolean;
  supportsMediaSync: boolean;
  supportsRequestSync: boolean;
  supportsAutoFix: boolean;
  libraryLabel?: string;
}

export const INSTANCE_DEFINITIONS: Record<InstanceType, InstanceDefinition> = {
  sonarr: {
    type: "sonarr",
    label: "Sonarr",
    baseUrlPlaceholder: "http://localhost:8989",
    defaultName: "My Sonarr",
    supportsQueue: true,
    supportsIssues: true,
    supportsQuality: true,
    supportsMediaSync: true,
    supportsRequestSync: false,
    supportsAutoFix: true,
    libraryLabel: "Episodes",
  },
  radarr: {
    type: "radarr",
    label: "Radarr",
    baseUrlPlaceholder: "http://localhost:7878",
    defaultName: "My Radarr",
    supportsQueue: true,
    supportsIssues: true,
    supportsQuality: true,
    supportsMediaSync: true,
    supportsRequestSync: false,
    supportsAutoFix: true,
    libraryLabel: "Movies",
  },
  overseerr: {
    type: "overseerr",
    label: "Overseerr",
    baseUrlPlaceholder: "http://localhost:5055",
    defaultName: "My Overseerr",
    supportsQueue: false,
    supportsIssues: false,
    supportsQuality: false,
    supportsMediaSync: false,
    supportsRequestSync: true,
    supportsAutoFix: false,
  },
};

export function getInstanceDefinition(type: InstanceType): InstanceDefinition {
  return INSTANCE_DEFINITIONS[type];
}

export function isArrInstanceType(type: InstanceType): type is ArrInstanceType {
  return type === "sonarr" || type === "radarr";
}

