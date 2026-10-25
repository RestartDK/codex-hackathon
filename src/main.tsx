import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/werewolf.css";
import AppShell from "./shell/AppShell.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
