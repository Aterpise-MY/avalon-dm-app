import React from "react";
import { createRoot } from "react-dom/client";
import AvalonDM from "./avalon-dm.jsx";
import AuthGate from "./auth-gate.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      {({ signOut }) => <AvalonDM onSignOut={signOut} />}
    </AuthGate>
  </React.StrictMode>,
);
