import { usePlatformIconStore } from "@/stores/platformIconStore";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PlatformIcon } from "../components/platform/PlatformIcon";

describe("PlatformIcon", () => {
  it("renders the unified software platform icon", () => {
    const { container } = render(<PlatformIcon agentId="cursor" />);
    const svg = container.querySelector("svg");

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("lucide-cpu");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a folder icon for project targets", () => {
    const { container } = render(<PlatformIcon agentId="project:1" />);

    expect(container.querySelector("svg")).toHaveClass("lucide-folder-open");
  });
});

it("uses a configured image for custom and builtin platforms",()=>{
  const icon="data:image/svg+xml;base64,PHN2Zy8+";
  usePlatformIconStore.setState({icons:{custom:icon,cursor:icon}});
  const {container}=render(<><PlatformIcon agentId="custom"/><PlatformIcon agentId="cursor" brand/></>);
  expect(container.querySelectorAll("img")).toHaveLength(2);
  expect(container.querySelector("img")).toHaveAttribute("src",icon);
  usePlatformIconStore.setState({icons:{}});
});
