declare module "react-simple-maps" {
  import type { ComponentType } from "react";
  type MapProps = Record<string, unknown>;
  export const ComposableMap: ComponentType<MapProps>;
  export const Geographies: ComponentType<MapProps>;
  export const Geography: ComponentType<MapProps>;
  export const Marker: ComponentType<MapProps>;
  export const Annotation: ComponentType<MapProps>;
  export const ZoomableGroup: ComponentType<MapProps>;
}
