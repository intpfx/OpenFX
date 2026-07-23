/** @jsxRuntime classic */
/** @jsx h */

import { createElement as h, type ReactNode } from "react";

type HomepageFooterDockProps = {
  meta: ReactNode;
  index: ReactNode;
  action: ReactNode;
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
      <div className="homepage-footer-dock__meta">{props.meta}</div>
      <div className="homepage-footer-dock__index">{props.index}</div>
      <div className="homepage-footer-dock__action">{props.action}</div>
    </footer>
  );
}
