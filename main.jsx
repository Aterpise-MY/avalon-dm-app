import React from "react";
import { createRoot } from "react-dom/client";
import AvalonDM from "./avalon-dm.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AvalonDM />
  </React.StrictMode>,
);
