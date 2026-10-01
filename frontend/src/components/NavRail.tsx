import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { scoreColor } from "../lib/color";
import { useMediaQuery } from "../lib/motion";
import { useApp } from "../lib/store";
import { useTheme } from "../lib/theme";
import "./NavRail.css";

const LINKS = [
  { to: "/", label: "Analyze" },
  { to: "/arena", label: "Model arena" },
  { to: "/robustness", label: "Robustness lab" },
  { to: "/pulse", label: "Live pulse" },
  { to: "/bulk", label: "Bulk analyzer" },
];

export function NavRail() {
  const { lastScore } = useApp();
  const { theme, palette, toggle } = useTheme();
  const compact = useMediaQuery("(max-width: 719px)");
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const marker = lastScore === null ? palette.pencil : scoreColor(lastScore, theme);
  const themeButton = (
    <button type="button" className="button button--quiet nav__theme" onClick={toggle}>
      <span className="visually-hidden">Switch to the </span>
      {theme === "night" ? "Bench" : "Night lab"}
      <span className="visually-hidden"> theme</span>
    </button>
  );

  const links = (
    <ul className="nav__links">
      {LINKS.map((link) => (
        <li key={link.to}>
          <NavLink to={link.to} end={link.to === "/"} className="nav__link">
            {({ isActive }) => (
              <>
                <span
                  className="nav__marker"
                  aria-hidden="true"
                  style={{ backgroundColor: isActive ? marker : "transparent" }}
                />
                {link.label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <header className="nav nav--compact">
        <div className="nav__bar">
          <NavLink to="/" className="nav__wordmark">
            TweetLens
          </NavLink>
          <button
            type="button"
            className="button button--quiet"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close menu" : "Menu"}
          </button>
        </div>
        <nav id="nav-menu" aria-label="Pages" hidden={!open} className="nav__menu">
          {links}
          {themeButton}
        </nav>
      </header>
    );
  }

  return (
    <aside className="nav">
      <div className="nav__inner">
        <NavLink to="/" className="nav__wordmark">
          TweetLens
        </NavLink>
        <nav aria-label="Pages">{links}</nav>
        <div className="nav__foot">{themeButton}</div>
      </div>
    </aside>
  );
}
