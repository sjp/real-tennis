import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { armAudio, setVolume } from "./audio/engine.ts";
import { settings } from "./render/settings.ts";

armAudio();
setVolume(settings.get().volume);
settings.subscribe(() => {
  setVolume(settings.get().volume);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
