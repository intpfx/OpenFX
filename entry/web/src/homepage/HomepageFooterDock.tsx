/** @jsxRuntime classic */
/** @jsx h */

import { createElement as h, type ReactNode } from "react";

type HomepageFooterDockProps = {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
  inert?: boolean;
  ariaHidden?: boolean;
};

export function HomepageFooterDock(props: HomepageFooterDockProps) {
  return (
    <footer
      aria-hidden={props.ariaHidden ? true : undefined}
      aria-label="首页控制栏"
      className="homepage-footer-dock"
      inert={props.inert ? true : undefined}
    >
      <div className="homepage-footer-dock__left">{props.left}</div>
      <div className="homepage-footer-dock__middle">{props.middle}</div>
      <div className="homepage-footer-dock__right">{props.right}</div>
    </footer>
  );
}
