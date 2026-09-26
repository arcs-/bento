# Snap at halfway

Dragging below `min` holds the panel at `min`. Past halfway between `min` and `collapsed-size` it snaps to collapsed; dragging back past halfway un-snaps it. Arrow keys snap as soon as they go below `min`.

## Why
The hold at `min` tells the user a collapse is coming, and the gap before the snap stops flicker at the boundary. VS Code and react-resizable-panels both snap at halfway. react-resizable-panels skips the threshold for keys, because a halfway threshold could stop a keyboard user from expanding at all.

## Sources
- [VS Code splitview.ts, snap at half the minimum size](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/splitview/splitview.ts)
- [react-resizable-panels adjustLayoutByDelta.ts](https://github.com/bvaughn/react-resizable-panels/blob/main/lib/global/utils/adjustLayoutByDelta.ts)
