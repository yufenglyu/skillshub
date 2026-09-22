import {useRef,useState} from "react";
import {render,screen,fireEvent} from "@testing-library/react";
import {it,expect} from "vitest";
import {SearchInput} from "@/components/ui/search-input";
import {useConfiguredHotkey} from "@/hooks/useConfiguredHotkey";
import {focusPageSearch} from "@/lib/focusPageSearch";
function Harness({hidden=false,dialog=false}:{hidden?:boolean;dialog?:boolean}) {
  const main=useRef<HTMLElement>(null);
  useConfiguredHotkey("focusPageSearch",()=>focusPageSearch(main.current),{allowInEditable:true});
  return <><main ref={main}>
    <div hidden={hidden}><SearchInput aria-label="Current search" value="existing" onValueChange={()=>{}}/></div>
    <textarea aria-label="Notes"/>
  </main>{dialog && <div role="dialog"><button>Cancel</button></div>}</>;
}
it("focuses and selects the current search text even while editing another field",()=>{
  render(<Harness/>);
  screen.getByLabelText("Notes").focus();
  fireEvent.keyDown(document.activeElement!,{key:"f",ctrlKey:true});
  const input=screen.getByLabelText<HTMLInputElement>("Current search");
  expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(8);
});
it("does not focus a hidden page or escape a modal without search",()=>{
  const view=render(<Harness hidden/>);
  screen.getByLabelText("Notes").focus();
  fireEvent.keyDown(window,{key:"f",ctrlKey:true});
  expect(screen.getByLabelText("Notes")).toHaveFocus();
  view.rerender(<Harness dialog/>);
  screen.getByRole("button",{name:"Cancel"}).focus();
  fireEvent.keyDown(window,{key:"f",ctrlKey:true});
  expect(screen.getByRole("button",{name:"Cancel"})).toHaveFocus();
});
it("leaves other key combinations alone",()=>{
  render(<Harness/>);
  screen.getByLabelText("Notes").focus();
  fireEvent.keyDown(window,{key:"f",ctrlKey:true,shiftKey:true});
  expect(screen.getByLabelText("Notes")).toHaveFocus();
});

it("Escape clears search and leaves focus without closing the containing UI",()=>{
  function Search(){const [value,setValue]=useState("query");return <SearchInput aria-label="Search" value={value} onValueChange={setValue}/>;}
  render(<Search/>);
  const input=screen.getByLabelText("Search"); input.focus();
  fireEvent.keyDown(input,{key:"Escape"});
  expect(input).toHaveValue("");
  expect(input).not.toHaveFocus();
});
