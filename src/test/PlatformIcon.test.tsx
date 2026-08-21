import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PlatformIcon } from "../components/platform/PlatformIcon";
import { usePlatformStore } from "../stores/platformStore";

const SAMPLE_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><circle cx='4' cy='4' r='3' fill='black'/></svg>";

describe("PlatformIcon", () => {
  it("renders a generic SVG when no catalog icon is available", () => {
    const { container } = render(<PlatformIcon agentId="unknown-platform-xyz" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an image when iconSrc is provided", () => {
    const { container } = render(
      <PlatformIcon agentId="cursor" iconSrc={SAMPLE_ICON} />
    );
    expect(container.querySelector("img")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", SAMPLE_ICON);
  });

  it("uses the platform catalog icon from the store", () => {
    const previous = usePlatformStore.getState().agents;
    usePlatformStore.setState({
      agents: [
        {
          id: "cursor",
          display_name: "Cursor",
          category: "coding",
          global_skills_dir: "~/.cursor/skills",
          is_detected: true,
          is_builtin: true,
          is_enabled: true,
          icon_src: SAMPLE_ICON,
        },
      ],
    });
    const { container } = render(<PlatformIcon agentId="cursor" />);
    expect(container.querySelector("img")).toHaveAttribute("src", SAMPLE_ICON);
    usePlatformStore.setState({ agents: previous });
  });

  it("keeps a square viewBox on the generic fallback icon", () => {
    const { container } = render(<PlatformIcon agentId="missing" />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 16 16");
  });
});
