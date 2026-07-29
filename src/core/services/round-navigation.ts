export type ContainedScrollMetrics = {
  containerScrollTop: number;
  containerClientHeight: number;
  itemOffsetTop: number;
  itemOffsetHeight: number;
  padding?: number;
};

export function calculateContainedScrollTop({
  containerScrollTop,
  containerClientHeight,
  itemOffsetTop,
  itemOffsetHeight,
  padding = 8,
}: ContainedScrollMetrics): number {
  const visibleTop = containerScrollTop + padding;
  const visibleBottom =
    containerScrollTop + containerClientHeight - padding;
  const itemBottom = itemOffsetTop + itemOffsetHeight;

  if (itemOffsetTop < visibleTop) {
    return Math.max(0, itemOffsetTop - padding);
  }

  if (itemBottom > visibleBottom) {
    return Math.max(
      0,
      itemBottom - containerClientHeight + padding,
    );
  }

  return containerScrollTop;
}

export function shouldAdjustNavigatorScroll(
  currentScrollTop: number,
  targetScrollTop: number,
  tolerance = 1,
): boolean {
  return Math.abs(currentScrollTop - targetScrollTop) > tolerance;
}

export type RoundActivationSource = "observer" | "user";

export function shouldScrollDocumentForRoundActivation(
  source: RoundActivationSource,
): boolean {
  return source === "user";
}
