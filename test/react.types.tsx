import "../src/react.ts";

/**
 * Compile-time checks of the `bento/react` JSX typings. This file is typechecked, never run:
 * every line marked `@ts-expect-error` must fail to compile.
 */

export const layoutAsWritten = (
  <bento-group
    orientation="horizontal"
    className="h-full"
    onresizeCapture={(event) => event.target}
    ontoggleCapture={(event) => event.newState}
  >
    <bento-panel
      id="sidebar"
      size="370px"
      min="270px"
      max="600px"
      collapsible
      collapsed={false}
      collapsed-size="48px"
      modal="(max-width: 768px)"
      aria-label="Sidebar"
      onresize={(event) => event.type}
      onresizeend={(event) => event.type}
      onbeforetoggle={(event) => event.preventDefault()}
      ontoggle={(event) => {
        const state: "open" | "closed" = event.newState;
        return state;
      }}
    />
    <bento-separator aria-label="Sidebar" aria-controls="sidebar" tabIndex={0} />
    <bento-panel />
  </bento-group>
);

export const mistakes = [
  // @ts-expect-error orientation is horizontal or vertical
  <bento-group orientation="diagonal" />,
  // @ts-expect-error collapsed is a boolean
  <bento-panel collapsed="yes" />,
  // @ts-expect-error React's own onToggle never reaches a custom element's toggle event
  <bento-panel onToggle={() => undefined} />,
  // @ts-expect-error a panel has no orientation
  <bento-panel orientation="vertical" />,
];
