import { lazy, Suspense } from "react";
import { Menu } from "./render/Menu.tsx";

// Every screen but the menu loads on demand, so the menu never waits for
// three.js and the developer-only Sandbox (with leva) stays out of the way.
const Learn = lazy(() => import("./render/Learn.tsx").then((m) => ({ default: m.Learn })));
const Match = lazy(() => import("./render/Match.tsx").then((m) => ({ default: m.Match })));
const Orbit = lazy(() => import("./render/Orbit.tsx").then((m) => ({ default: m.Orbit })));
const Practice = lazy(() => import("./render/Practice.tsx").then((m) => ({ default: m.Practice })));
const Rules = lazy(() => import("./render/Rules.tsx").then((m) => ({ default: m.Rules })));
const Sandbox = lazy(() => import("./render/Sandbox.tsx").then((m) => ({ default: m.Sandbox })));
const Settings = lazy(() => import("./render/Settings.tsx").then((m) => ({ default: m.Settings })));

function Screen() {
  const params = new URLSearchParams(location.search);
  if (params.has("sandbox")) return <Sandbox />;
  if (params.has("match")) return <Match />;
  if (params.has("rules")) return <Rules />;
  if (params.has("learn")) return <Learn />;
  if (params.has("settings")) return <Settings />;
  if (params.has("orbit")) return <Orbit />;
  if (params.has("practice")) return <Practice />;
  return <Menu />;
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#101418" }} />}>
      <Screen />
    </Suspense>
  );
}
