import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import { GLOBAL_REGIONS, regionFor } from "../domain/geography";

interface Props {
  /** Reference-group codes to highlight (e.g. the regions overlapping a gene). */
  highlighted: string[];
  /** Diameter in px. */
  size?: number;
}

interface RegionPoint {
  code: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  on: boolean;
}

/**
 * Realistic 3D globe (react-globe.gl / ThreeJS / WebGL) with precise continents
 * from a NASA Blue Marble Earth texture. Reference-region markers sit on the
 * surface; the globe auto-rotates and eases to the first highlighted region so
 * a selected chromosome region visibly "points at" its reference group.
 *
 * Textures are vendored locally (public/globe/*) so the demo stays fully offline
 * (HACKATHON_PROJECT_PLAN.md Section 11) — no CDN/network request.
 *
 * Markers denote reference-population regions used for local-ancestry inference
 * — visualization anchors, not a claim that a person or variant originates from
 * a single point (Section 2 terminology).
 */
export function Globe({ highlighted, size = 300 }: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const highlightSet = useMemo(() => new Set(highlighted), [highlighted]);

  const points = useMemo<RegionPoint[]>(
    () =>
      Object.values(GLOBAL_REGIONS)
        .filter((r) => r.code !== "UNKNOWN")
        .map((r) => ({
          code: r.code,
          name: r.name,
          lat: r.lat,
          lng: r.lng,
          color: r.color,
          on: highlightSet.has(r.code),
        })),
    [highlightSet],
  );

  const labels = useMemo(
    () => points.filter((p) => p.on),
    [points],
  );

  const target = highlighted.find((h) => h !== "UNKNOWN");

  // Configure controls once the globe instance exists.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = false;
    g.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 0);
    setReady(true);
  }, []);

  // Ease the camera to the first highlighted region on selection.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready || !target) return;
    const region = GLOBAL_REGIONS[target];
    if (!region) return;
    g.pointOfView(
      { lat: region.lat, lng: region.lng, altitude: 1.8 },
      1000,
    );
  }, [target, ready]);

  return (
    <div
      className="globe-wrap"
      role="img"
      aria-label={`Interactive 3D globe highlighting reference regions: ${
        highlighted.map((h) => regionFor(h).name).join(", ") || "none"
      }. Drag to rotate.`}
    >
      <GlobeGL
        ref={globeRef}
        width={size}
        height={size}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/globe/earth-blue-marble.jpg"
        bumpImageUrl="/globe/earth-topology.png"
        showAtmosphere
        atmosphereColor="#6ab0ff"
        atmosphereAltitude={0.18}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={(d) => ((d as RegionPoint).on ? 0.12 : 0.01)}
        pointRadius={(d) => ((d as RegionPoint).on ? 0.7 : 0.35)}
        pointsMerge={false}
        pointResolution={12}
        labelsData={labels}
        labelLat="lat"
        labelLng="lng"
        labelText="name"
        labelSize={1.6}
        labelDotRadius={0.5}
        labelColor={() => "#ffffff"}
        labelResolution={2}
      />
      <p className="subtitle globe-caption">
        Drag to spin. Markers are reference-population anchors, not origin points
        for any person or variant.
      </p>
    </div>
  );
}

// Default export so the component can be code-split with React.lazy (ThreeJS is
// heavy and only needed when a region detail is open).
export default Globe;
