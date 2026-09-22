function isVisible(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/** Keep focus inside an open dialog, otherwise search only the current main view. */
export function focusPageSearch(main: HTMLElement | null): void {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].filter(isVisible);
  const scope = dialogs.at(-1) ?? main;
  const inputs = [...(scope?.querySelectorAll<HTMLInputElement>('input[data-page-search="true"]') ?? [])];
  const target = inputs.find(input => !input.disabled && !input.readOnly && isVisible(input));
  target?.focus();
  target?.select();
}
