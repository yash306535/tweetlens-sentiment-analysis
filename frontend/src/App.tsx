import { MotionConfig } from "framer-motion";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

import { NavRail } from "./components/NavRail";
import { AppProvider } from "./lib/store";
import { ThemeProvider } from "./lib/theme";
import { AnalyzePage } from "./pages/AnalyzePage";
import { NotFoundPage } from "./pages/NotFoundPage";

const ArenaPage = lazy(() => import("./pages/ArenaPage").then((m) => ({ default: m.ArenaPage })));
const RobustnessPage = lazy(() => import("./pages/RobustnessPage").then((m) => ({ default: m.RobustnessPage })));
const PulsePage = lazy(() => import("./pages/PulsePage").then((m) => ({ default: m.PulsePage })));
const BulkPage = lazy(() => import("./pages/BulkPage").then((m) => ({ default: m.BulkPage })));

const TITLES: Record<string, string> = {
  "/": "Analyze a tweet",
  "/arena": "Model arena",
  "/robustness": "Robustness lab",
  "/pulse": "Live pulse",
  "/bulk": "Bulk analyzer",
};

function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = TITLES[pathname];
    document.title = title ? `${title} | TweetLens` : "TweetLens";
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <PageTitle />
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <div className="app">
              <NavRail />
              <main id="main" className="main" tabIndex={-1}>
                <Suspense fallback={<p className="muted">Loading the page…</p>}>
                  <Routes>
                    <Route path="/" element={<AnalyzePage />} />
                    <Route path="/arena" element={<ArenaPage />} />
                    <Route path="/robustness" element={<RobustnessPage />} />
                    <Route path="/pulse" element={<PulsePage />} />
                    <Route path="/bulk" element={<BulkPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
          </BrowserRouter>
        </MotionConfig>
      </AppProvider>
    </ThemeProvider>
  );
}
