import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

// Lazy-loaded per route so each page's module graph — and CSS — only loads
// for the route that needs it. This matters beyond bundle size: LandingPage
// pulls in landing.css's own :root (light/dark toggle theme), which would
// otherwise load unconditionally on every route and silently override the
// app-wide fixed dark theme in index.html (a real bug this fixed — a static
// top-level import pulls in a module's side effects, CSS included, whether
// or not that branch ever renders).
const AdminPage = lazy(() =>
  import("./admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const LandingPage = lazy(() =>
  import("./landing/LandingPage").then((m) => ({ default: m.LandingPage })),
);

// const path = window.location.pathname;
// const Page = path === "/admin" ? AdminPage : path === "/museum" ? App : LandingPage;
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "admin",
    Component: AdminPage,
  },
  {
    path: "/museum",
    Component: App,
  },
]);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {/* <Page /> */}
      <RouterProvider router={router} />
    </Suspense>
  </StrictMode>,
);
