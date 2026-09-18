import { fireEvent, screen, within } from "@testing-library/react";

export function openRowActions(row: HTMLElement) {
  fireEvent.contextMenu(row);
  return within(screen.getByRole("menu"));
}
