import {it,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {PlatformDialog} from "@/components/settings/PlatformDialog";
import {usePlatformIconStore} from "@/stores/platformIconStore";
it("copies a chosen image after creating the platform and previews it",async()=>{
  const add=vi.fn().mockResolvedValue("example");
  const save=vi.spyOn(usePlatformIconStore.getState(),"save").mockResolvedValue();
  const close=vi.fn();
  render(<PlatformDialog open onOpenChange={close} platform={null} onAdd={add}/>);
  fireEvent.change(screen.getByLabelText(/平台名称|名称/),{target:{value:"Example"}});
  const file=new File(["<svg/>"],"icon.svg",{type:"image/svg+xml"});
  fireEvent.change(screen.getByLabelText("平台图标"),{target:{files:[file]}});
  await waitFor(()=>expect(document.querySelector("img[src^='data:']")).not.toBeNull());
  fireEvent.click(screen.getByRole("button",{name:"添加"}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith("example",expect.stringContaining("data:image/svg+xml;base64,")));
  expect(close).toHaveBeenCalledWith(false);
  save.mockRestore();
});
