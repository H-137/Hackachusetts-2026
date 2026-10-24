import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import { GLOBAL_REGIONS, regionFor } from "../domain/geography";

interface Props {
  /** Reference-group codes to highlight (e.g. the regions overlapping a gene). */
  highlighted: string[];
  populationLabels?: Record<string, string>;
  focusedPopulation?: string | null;
  /** Diameter in px (ignored when fullpage). */
  size?: number;
  /**
   * Camera zoom. 1 = default framing; larger = closer. Internally scales the
   * camera altitude (closer altitude = more zoomed in).
   */
  zoom?: number;
  /**
   * Render as a full-viewport background canvas. The canvas fills the window
   * and the globe is shifted toward the right so page content can overlay the
   * left side. The atmosphere glow fades over the whole page with no hard edge.
   */
  fullpage?: boolean;
}

interface RegionPoint {
  code: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  on: boolean;
}

interface RegionRing {
  lat: number;
  lng: number;
  color: string;
}

/**
 * Realistic 3D globe (react-globe.gl / ThreeJS / WebGL) with precise continents
 * from a NASA Blue Marble Earth texture. Reference-region markers sit on the
 * surface; the globe auto-rotates and eases to the first highlighted region so
 * a selected chromosome region visibly "points at" its reference group.
 *
 * A highlighted region is outlined with an animated ring ("region of origin")
 * plus a raised, colored marker and a large label, so the origin reads clearly.
 *
 * Textures are vendored locally (public/globe/*) so the demo stays fully offline
 * (HACKATHON_PROJECT_PLAN.md Section 11) — no CDN/network request.
 *
 * Markers denote reference-population regions used for local-ancestry inference
 * — visualization anchors, not a claim that a person or variant originates from
 * a single point (Section 2 terminology).
 */
export function Globe({ highlighted, size = 300, zoom = 1, fullpage = false, populationLabels, focusedPopulation }: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [ready, setReady] = useState(false);
  const highlightSet = useMemo(() => new Set(highlighted), [highlighted]);

  // Track the viewport so the background canvas always fills the window.
  const [winSize, setWinSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  useEffect(() => {
    if (!fullpage) return;
    const onResize = () =>
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fullpage]);

  const canvasW = fullpage ? winSize.w : size;
  const canvasH = fullpage ? winSize.h : size;

  // Leave room for the complete sphere and atmosphere even at maximum zoom.
  // A full-page canvas is much larger, so pull the camera back a touch so the
  // globe reads at a comparable on-screen size to the boxed version.
  const zoomAdjust = fullpage ? 1.9 : 1;
  const baseAltitude = Math.max(2.1, (2.7 * zoomAdjust) / (zoom * zoomLevel));
  const focusAltitude = Math.max(2.1, (2.6 * zoomAdjust) / (zoom * zoomLevel));

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

  const labels = useMemo(() => points.filter((p) => p.on), [points]);

  const rings = useMemo<RegionRing[]>(
    () =>
      points
        .filter((p) => p.on)
        .map((p) => ({ lat: p.lat, lng: p.lng, color: p.color })),
    [points],
  );

  const target = focusedPopulation ?? highlighted.find((h) => h !== "UNKNOWN");
  const focusRegions = (focusedPopulation ? [focusedPopulation] : highlighted).map((code) => GLOBAL_REGIONS[code]).filter((r): r is NonNullable<typeof r> => !!r && r.code !== "UNKNOWN");
  const centerLat = focusRegions.length ? focusRegions.reduce((sum, r) => sum + r.lat, 0) / focusRegions.length : 20;
  const centerLng = Math.atan2(focusRegions.reduce((sum, r) => sum + Math.sin(r.lng * Math.PI / 180), 0), focusRegions.reduce((sum, r) => sum + Math.cos(r.lng * Math.PI / 180), 0)) * 180 / Math.PI;

  // Start still so selected reference groups remain easy to inspect.
  const [spinning, setSpinning] = useState(false);

  // Configure controls once the globe instance exists. Rotate (drag to pan
  // around the sphere) and zoom are enabled.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    controls.enableRotate = true;
    controls.enableZoom = true;
    // Keep the sphere and atmosphere inside the square canvas, including
    // when wheel/pinch zoom bypasses the toolbar's zoom state.
    controls.minDistance = g.getGlobeRadius() * 3.1;
    controls.maxDistance = 650;
    controls.enablePan = false;
    g.pointOfView({ lat: 20, lng: 0, altitude: baseAltitude }, 0);
    setReady(true);
    // Run once to set up controls + initial framing; later altitude changes are
    // handled by the focus effect below.
  }, []);

  // Apply spin state to the live controls whenever it changes.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    g.controls().autoRotate = spinning;
  }, [spinning, ready]);

  // Ease the camera to the first highlighted region on selection.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    if (target) {
      const region = GLOBAL_REGIONS[target];
      if (region) {
        g.pointOfView(
          { lat: centerLat, lng: centerLng, altitude: focusAltitude },
          1000,
        );
      }
    } else {
      g.pointOfView({ lat: 20, lng: 0, altitude: baseAltitude }, 800);
    }
  }, [target, centerLat, centerLng, ready, focusAltitude, baseAltitude]);

  const globeEl = (
    <GlobeGL
        ref={globeRef}
        width={canvasW}
        height={canvasH}
        backgroundColor="rgba(0,0,0,0)"
        onGlobeClick={() => setSpinning((s) => !s)}
        globeImageUrl="/globe/earth-blue-marble.jpg"
        bumpImageUrl="/globe/earth-topology.png"
        showAtmosphere
        atmosphereColor="#6ab0ff"
        atmosphereAltitude={0.18}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointLabel="name"
        pointAltitude={(d) => ((d as RegionPoint).on ? 0.025 : 0.005)}
        pointRadius={(d) => ((d as RegionPoint).on ? 0.85 : 0.3)}
        pointsMerge={false}
        pointResolution={12}
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d: object) => {
          const c = (d as RegionRing).color;
          // Fade the ring from solid to transparent as it propagates outward.
          return (t: number) => withAlpha(c, 1 - t);
        }}
        ringMaxRadius={6}
        ringPropagationSpeed={3}
        ringRepeatPeriod={900}
        ringResolution={64}
        ringAltitude={0.011}
        labelsData={labels}
        labelLat="lat"
        labelLng="lng"
        labelText={(d) => populationLabels?.[(d as RegionPoint).code] ?? (d as RegionPoint).code}
        labelSize={1.7}
        labelDotRadius={0.7}
        labelColor={() => "#ffffff"}
        labelResolution={3}
      />
  );

  const ariaLabel = `Interactive 3D globe highlighting reference regions: ${
    highlighted.map((h) => regionFor(h).name).join(", ") || "none"
  }. Drag to rotate.`;

  if (fullpage) {
    // Full-viewport background canvas. The globe is shifted right (via a CSS
    // transform on the canvas container) so page content overlays the left.
    return (
      <div className="globe-bg" role="img" aria-label={ariaLabel}>
        {globeEl}
      </div>
    );
  }

  return (
    <div className="globe-wrap">
      <div role="img" aria-label={ariaLabel}>{globeEl}</div>
      <div className="globe-controls" aria-label="Globe controls">
        <button className="secondary" onClick={() => setZoomLevel((z) => Math.min(1.25, z + 0.125))} disabled={zoomLevel >= 1.25} aria-label="Zoom in on globe">＋</button>
        <button className="secondary" onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.2))} disabled={zoomLevel <= 0.7} aria-label="Zoom out on globe">−</button>
        <button className="secondary" aria-pressed={spinning} onClick={() => setSpinning((s) => !s)}>{spinning ? "Pause rotation" : "Rotate globe"}</button>
        <button className="secondary" onClick={() => {
          setZoomLevel(1); setSpinning(false);
          globeRef.current?.pointOfView({lat:20, lng:0, altitude:Math.max(2.1, 2.7 / zoom)}, 500);
        }}>Reset view</button>
      </div>
    </div>
  );
}

/** Convert a #rrggbb hex color to rgba() with the given alpha (0–1). */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

// Default export so the component can be code-split with React.lazy (ThreeJS is
// heavy and only needed when a region detail is open).
export default Globe;
