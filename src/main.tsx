import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminPage } from "./admin/AdminPage";
import { App } from "./App";
import { LandingPage } from "./landing/LandingPage";

const path = window.location.pathname;
const page = path === "/admin" ? <AdminPage /> : path === "/museum" ? <App /> : <LandingPage />;

createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
