import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SearchScopes } from "@/components/skill/SearchScopes";
import { allSearchScopes } from "@/lib/skillFilters";

function setup() {
  const onChange = vi.fn();
  const { container } = render(<><SearchScopes value={allSearchScopes} onChange={onChange}/><button>outside</button></>);
  const details = container.querySelector("details")!;
  details.open = true;
  return { details, onChange, summary: container.querySelector("summary")! };
}

it("closes on an outside pointer click but stays open when choosing scopes", () => {
  const { details, onChange } = setup();
  const checkbox = screen.getAllByRole("checkbox")[0];
  fireEvent.pointerDown(checkbox);
  fireEvent.click(checkbox);
  expect(details.open).toBe(true);
  expect(onChange).toHaveBeenCalledOnce();
  fireEvent.pointerDown(screen.getByText("outside"));
  expect(details.open).toBe(false);
});

it("closes when focus leaves the filter, including window blur", () => {
  const { details, summary } = setup();
  summary.focus();
  screen.getAllByRole("checkbox")[0].focus();
  expect(details.open).toBe(true);
  screen.getByText("outside").focus();
  expect(details.open).toBe(false);
  details.open = true;
  fireEvent.blur(window);
  expect(details.open).toBe(false);
});

it("Escape closes the popup and returns focus without triggering parent search shortcuts", () => {
  const { details, summary } = setup();
  const parentShortcut = vi.fn();
  document.addEventListener("keydown", parentShortcut);
  try {
    const checkbox = screen.getAllByRole("checkbox")[0];
    checkbox.focus();
    fireEvent.keyDown(checkbox, {key: "Escape"});
    expect(details.open).toBe(false);
    expect(summary).toHaveFocus();
    expect(parentShortcut).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("keydown", parentShortcut);
  }
});
