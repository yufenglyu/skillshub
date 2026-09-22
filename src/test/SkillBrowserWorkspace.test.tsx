import { type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { openRowActions } from "./rowActions";
import { fireEvent, render as testingRender, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillBrowserWorkspace } from "@/components/skill/SkillBrowserWorkspace";
import type { FolderTableItem, SkillTableItem } from "@/components/skill/SkillBrowserTable";
vi.mock("@/components/skill/SkillDetailView", async (importOriginal) => ({ ...await importOriginal<typeof import("@/components/skill/SkillDetailView")>(), SkillDetailView: ({skillId,agentId,rowId,inspectorTab}:{skillId:string;agentId?:string;rowId?:string;inspectorTab:string}) => <div data-testid="inspector">{[skillId,agentId,rowId,inspectorTab].join("|")}</div> }));
const render = (ui: ReactElement) => ui.type === MemoryRouter ? testingRender(ui) : testingRender(ui, {wrapper: MemoryRouter});
const remove = vi.fn();
const skills: SkillTableItem[] = [
  {rowKey:"one",detailRequest:{skillId:"one"},name:"First skill",sourceRepo:"Example/Tools",onRemove:remove},
  {rowKey:"two",detailRequest:{skillId:"two"},name:"Second skill",sourceRepo:"Example/Tools"},
];
const folders: FolderTableItem[] = [{key:"repo",name:"Example/Tools",path:"/demo/tools",skillCount:2,skillKeys:["one","two"],githubStars:20,onOpen:vi.fn()}];
const props={storageKey:"test",skills,folders,showGithubStars:true};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks()});
describe("tree browser workspace",()=>{
 it("keeps selection separate from expansion and renders one shared table",()=>{
  render(<SkillBrowserWorkspace {...props}/>);
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.queryByText("First skill")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Example/Tools"}));
  expect(screen.getByRole("heading",{name:"Example/Tools"})).toBeInTheDocument();
  expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"展开 Example/Tools"}));
  fireEvent.click(screen.getAllByRole("button",{name:"查看 First skill 的详情"})[0]);
  expect(screen.getByTestId("inspector")).toHaveTextContent("one|||overview");
  expect(screen.getAllByRole("columnheader").map(h=>h.getAttribute("aria-label"))).toEqual(["序号","名称","技能数","星标数","创建时间","更新时间"]);
 });
 it("selects skill rows from non-interactive cells",()=>{
  render(<SkillBrowserWorkspace {...props}/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));
  const row=screen.getByRole("button",{name:"查看 First skill 的详情"}).closest("tr")!;
  fireEvent.click(within(row).getAllByRole("cell")[0]);expect(screen.getByTestId("inspector")).toHaveTextContent("one");
 });
 it("row actions do not change the current selection",()=>{
  render(<SkillBrowserWorkspace {...props}/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));
  fireEvent.click(screen.getByRole("button",{name:"查看 Second skill 的详情"}));
  const row=screen.getByRole("button",{name:"查看 First skill 的详情"}).closest("tr")!;
  fireEvent.click(openRowActions(row).getByRole("menuitem", { name: "删除"}));
  expect(screen.getByTestId("inspector")).toHaveTextContent("two");
 });
 it("search expands matching rows without overwriting saved expansion",()=>{
  const {rerender}=render(<SkillBrowserWorkspace {...props}/>);
  rerender(<SkillBrowserWorkspace {...props} skills={[skills[1]]} searchActive/>);
  expect(screen.getByRole("button",{name:"查看 Second skill 的详情"})).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"查看 First skill 的详情"})).not.toBeInTheDocument();
  rerender(<SkillBrowserWorkspace {...props}/>);
  expect(screen.queryByRole("button",{name:"查看 Second skill 的详情"})).not.toBeInTheDocument();
 });
 it("retains expanded repositories after remount",()=>{
  const {unmount}=render(<SkillBrowserWorkspace {...props}/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));unmount();
  render(<SkillBrowserWorkspace {...props}/>);expect(screen.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
 });
 it("keeps the active document tab when selecting another skill",()=>{
  render(<SkillBrowserWorkspace {...props}/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));fireEvent.click(screen.getByRole("button",{name:"查看 First skill 的详情"}));fireEvent.click(screen.getByRole("tab",{name:"文档"}));fireEvent.click(screen.getByRole("button",{name:"查看 Second skill 的详情"}));expect(screen.getByTestId("inspector")).toHaveTextContent("two|||document");
 });
 it("clears stale detail when the selected skill is removed or filtered out",()=>{
  const {rerender}=render(<SkillBrowserWorkspace {...props}/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));fireEvent.click(screen.getByRole("button",{name:"查看 First skill 的详情"}));rerender(<SkillBrowserWorkspace {...props} skills={[skills[1]]}/>);expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
 });
 it("passes platform row identity to the embedded detail",()=>{
  const duplicates=skills.map((s,i)=>({...s,name:"Same name",detailRequest:{skillId:"same",agentId:"cursor",rowId:`row-${i}`}}));
  render(<SkillBrowserWorkspace {...props} skills={duplicates} agentId="cursor"/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));fireEvent.click(screen.getAllByRole("button",{name:"查看 Same name 的详情"})[1]);expect(screen.getByTestId("inspector")).toHaveTextContent("same|cursor|row-1|overview");
 });
 it("repository location highlights expand and select the target skill",()=>{
  render(<SkillBrowserWorkspace {...props} skills={[{...skills[0],highlighted:true},skills[1]]}/>);expect(screen.getByTestId("inspector")).toHaveTextContent("one");expect(screen.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
 });
 it("supports hiding and restoring the preview and keyboard resizing",()=>{
  render(<SkillBrowserWorkspace {...props}/>);const splitter=screen.getByRole("separator",{name:"调整列表与预览宽度"});fireEvent.keyDown(splitter,{key:"ArrowLeft"});expect(splitter).toHaveAttribute("aria-valuenow","47");fireEvent.click(screen.getByRole("button",{name:"收起预览"}));expect(screen.queryByRole("tablist")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"显示预览"}));expect(screen.getByRole("tablist")).toBeInTheDocument();
 });
 it("numeric group sorting keeps unknown stars last",()=>{
  const more=[...folders,{...folders[0],key:"large",name:"Large",githubStars:100,skillKeys:[]},{...folders[0],key:"unknown",name:"Unknown",githubStars:null,skillKeys:[]}];
  render(<SkillBrowserWorkspace {...props} folders={more} sortField="githubStars" sortDirection="desc"/>);const rows=screen.getAllByRole("row").slice(1);expect(rows[0]).toHaveTextContent("Large");expect(rows[2]).toHaveTextContent("Unknown");
 });
 it("does not render any modal drawer",()=>{render(<SkillBrowserWorkspace {...props}/>);fireEvent.click(screen.getByRole("button", {name:"全部展开"}));fireEvent.click(screen.getByRole("button",{name:"查看 First skill 的详情"}));expect(screen.queryByRole("dialog")).not.toBeInTheDocument()});
 it("expands and collapses the focused table with plus/minus without consuming text input", () => {
  render(<SkillBrowserWorkspace {...props} toolbar={<input aria-label="filter" />} />);
  const list = screen.getByRole("region", {name:"技能列表"});
  fireEvent.keyDown(list, {key:"+", shiftKey:true});
  expect(screen.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText("filter"), {key:"-"});
  expect(screen.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
  fireEvent.keyDown(list, {key:"-"});
  expect(screen.queryByRole("button",{name:"查看 First skill 的详情"})).not.toBeInTheDocument();
  fireEvent.keyDown(list, {key:"+", code:"NumpadAdd"});
  expect(screen.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
 });
 it("shows folder metadata above a separate skill list without scrolling on selection", () => {
  const scroll = vi.fn();
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  try {
    render(<SkillBrowserWorkspace {...props} folders={[{...folders[0], createdAt:"2026-09-01T00:00:00Z", updatedAt:"2026-09-02T00:00:00Z"}]} />);
    fireEvent.click(screen.getByRole("button",{name:"Example/Tools"}));
    const metadata = screen.getByRole("region",{name:"基本信息"});
    expect(within(metadata).getByRole("link",{name:"Example/Tools"})).toHaveAttribute("href","https://github.com/Example/Tools");
    expect(within(metadata).getByText("/demo/tools")).toBeInTheDocument();
    const list = screen.getByRole("region",{name:"技能清单"});
    expect(within(list).getAllByRole("columnheader").map(header => header.getAttribute("aria-label"))).toEqual(["序号", "名称"]);
    expect(within(list).getByRole("cell", {name:"1"})).toBeInTheDocument();
    expect(metadata.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scroll).not.toHaveBeenCalled();
  } finally { HTMLElement.prototype.scrollIntoView = original; }
 });
 it("opens icon actions with the keyboard, preserves confirmation, and closes on Escape", async () => {
  render(<SkillBrowserWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button",{name:"全部展开"}));
  const row=screen.getByRole("button",{name:"查看 First skill 的详情"}).closest("tr")!;
  fireEvent.keyDown(row,{key:"F10",shiftKey:true});
  const menu=screen.getByRole("menu",{name:"First skill"});
  const action=within(menu).getByRole("menuitem",{name:"删除"});
  expect(action.querySelector("svg")).toBeInTheDocument();
  fireEvent.click(action);expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(menu).getByRole("menuitem",{name:"确认删除"}));
  expect(remove).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  fireEvent.contextMenu(row);
  fireEvent.keyDown(screen.getByRole("menu"),{key:"Escape"});
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();expect(row).toHaveFocus();
 });
 it("keeps unavailable folder update disabled and dismisses on outside click", () => {
  render(<SkillBrowserWorkspace {...props} folders={[{...folders[0],updateLabel:"更新"}]} />);
  const menu=openRowActions(screen.getByRole("button",{name:"Example/Tools"}).closest("tr")!);
  expect(menu.getByRole("menuitem",{name:"更新"})).toBeDisabled();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
 });
});

it("uses detected enabled targets in the install tab and links to their pages", () => {
 const targets = [{id:"cursor",display_name:"Cursor",global_skills_dir:"demo",is_detected:true,is_enabled:true,is_builtin:true}, {id:"missing",display_name:"Missing",global_skills_dir:"demo",is_detected:false,is_enabled:true,is_builtin:true}, {id:"disabled",display_name:"Disabled",global_skills_dir:"demo",is_detected:true,is_enabled:false,is_builtin:true}];
 render(<MemoryRouter><SkillBrowserWorkspace {...props} skills={[{...skills[0],isCentral:true,installAgents:targets}]}/></MemoryRouter>);
 fireEvent.click(screen.getByRole("button",{name:"全部展开"}));
 fireEvent.click(screen.getByRole("button",{name:"查看 First skill 的详情"}));
 fireEvent.click(screen.getByRole("tab",{name:"安装"}));
 expect(screen.getByRole("link",{name:/Cursor/})).toHaveAttribute("href","/platform/cursor");
 expect(screen.queryByRole("link",{name:/Missing|Disabled/})).not.toBeInTheDocument();
});

it("expands only the focused folder with Right and collapses it with Left", () => {
 render(<SkillBrowserWorkspace {...props} folders={[...folders,{key:"other",name:"Other",path:"",skillCount:0,onOpen:vi.fn()}]}/>);
 const list=within(screen.getByRole("region",{name:"技能列表"}));
 const button=screen.getByRole("button",{name:"Example/Tools"});
 const row=button.closest("tr")!;
 fireEvent.click(row);
 expect(row).toHaveFocus();
 fireEvent.keyDown(row,{key:"ArrowRight"});
 expect(list.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"展开 Other"})).toBeInTheDocument();
 fireEvent.keyDown(row,{key:"ArrowRight"});
 expect(list.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
 fireEvent.keyDown(row,{key:"ArrowLeft"});
 expect(list.queryByRole("button",{name:"查看 First skill 的详情"})).not.toBeInTheDocument();
 // Clicking the name leaves browser focus on the button; arrow navigation must move it to the row.
 fireEvent.click(button);
 button.focus();
 fireEvent.keyDown(button,{key:"ArrowRight"});
 expect(row).toHaveFocus();
 expect(button).not.toHaveFocus();
 expect(row).toHaveAttribute("aria-selected","true");
 expect(list.getByRole("button",{name:"查看 First skill 的详情"})).toBeInTheDocument();
 button.focus();
 fireEvent.keyDown(button,{key:"ArrowLeft"});
 expect(row).toHaveFocus();
 expect(list.queryByRole("button",{name:"查看 First skill 的详情"})).not.toBeInTheDocument();
});

it("moves selection, focus and details through visible rows with Up and Down", () => {
 render(<SkillBrowserWorkspace {...props}/>);
 const list=within(screen.getByRole("region",{name:"技能列表"}));
 const folder=list.getByRole("button",{name:"Example/Tools"}).closest("tr")!;
 fireEvent.click(folder);
 fireEvent.keyDown(folder,{key:"ArrowRight"});
 fireEvent.keyDown(folder,{key:"ArrowDown"});
 const first=list.getByRole("button",{name:"查看 First skill 的详情"}).closest("tr")!;
 expect(first).toHaveFocus();
 expect(first).toHaveAttribute("aria-selected","true");
 expect(screen.getByTestId("inspector")).toHaveTextContent("one");
 fireEvent.keyDown(first,{key:"ArrowDown"});
 const second=list.getByRole("button",{name:"查看 Second skill 的详情"}).closest("tr")!;
 expect(second).toHaveFocus();
 expect(screen.getByTestId("inspector")).toHaveTextContent("two");
 fireEvent.keyDown(second,{key:"ArrowDown"});
 expect(second).toHaveFocus();
 fireEvent.keyDown(second,{key:"ArrowUp"});
 expect(first).toHaveFocus();
 fireEvent.keyDown(first,{key:"ArrowUp"});
 expect(folder).toHaveFocus();
 fireEvent.keyDown(folder,{key:"ArrowLeft"});
 fireEvent.keyDown(folder,{key:"ArrowDown"});
 expect(folder).toHaveFocus();
 expect(list.queryByRole("button",{name:"查看 First skill 的详情"})).not.toBeInTheDocument();
});

it("uses Home and End within the selected row's folder or across folder rows", () => {
 const otherSkill: SkillTableItem = {rowKey:"other-skill", name:"Other skill", detailRequest:{skillId:"other-skill"}};
 render(<SkillBrowserWorkspace {...props} skills={[...skills,otherSkill]} folders={[
  {key:"before",name:"A Before",path:"",skillCount:0,onOpen:vi.fn()},
  ...folders,
  {key:"after",name:"Z After",path:"",skillCount:1,skillKeys:["other-skill"],onOpen:vi.fn()},
 ]}/>);
 fireEvent.click(screen.getByRole("button",{name:"全部展开"}));
 const list=within(screen.getByRole("region",{name:"技能列表"}));
 const first=list.getByRole("button",{name:"查看 First skill 的详情"}).closest("tr")!;
 const second=list.getByRole("button",{name:"查看 Second skill 的详情"}).closest("tr")!;
 fireEvent.click(second);
 fireEvent.keyDown(second,{key:"Home"});
 expect(first).toHaveFocus();
 expect(first).toHaveAttribute("aria-selected","true");
 expect(screen.getByTestId("inspector")).toHaveTextContent("one");
 fireEvent.keyDown(first,{key:"End"});
 expect(second).toHaveFocus();
 expect(second).toHaveAttribute("aria-selected","true");
 expect(screen.getByTestId("inspector")).toHaveTextContent("two");
 fireEvent.keyDown(second,{key:"End"});
 expect(second).toHaveFocus();
 const middle=list.getByRole("button",{name:"Example/Tools"}).closest("tr")!;
 const before=list.getByRole("button",{name:"A Before"}).closest("tr")!;
 const after=list.getByRole("button",{name:"Z After"}).closest("tr")!;
 fireEvent.click(middle);
 fireEvent.keyDown(middle,{key:"Home"});
 expect(before).toHaveFocus();
 expect(before).toHaveAttribute("aria-selected","true");
 expect(screen.getByRole("heading",{name:"A Before"})).toBeInTheDocument();
 fireEvent.keyDown(before,{key:"End"});
 expect(after).toHaveFocus();
 expect(after).toHaveAttribute("aria-selected","true");
 expect(screen.getByRole("heading",{name:"Z After"})).toBeInTheDocument();
 const single=list.getByRole("button",{name:"查看 Other skill 的详情"}).closest("tr")!;
 fireEvent.click(single);
 fireEvent.keyDown(single,{key:"Home"});
 expect(single).toHaveFocus();
 fireEvent.keyDown(single,{key:"End"});
 expect(single).toHaveFocus();
});

it("does not scroll back to an old located folder when selecting a later folder's skill", () => {
 const scroll = vi.fn();
 const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
 Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:scroll});
 try {
  const before: FolderTableItem = {key:"before",name:"A Before",path:"",skillCount:1,skillKeys:["before-skill"],highlighted:true,onOpen:vi.fn()};
  render(<SkillBrowserWorkspace {...props} folders={[before,...folders]} skills={[
   {rowKey:"before-skill",name:"Earlier skill",detailRequest:{skillId:"before-skill"}},...skills,
  ]}/>);
  expect(scroll).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"全部展开"}));
  scroll.mockClear();
  const list=within(screen.getByRole("region",{name:"技能列表"}));
  fireEvent.click(list.getByRole("button",{name:"查看 Second skill 的详情"}));
  expect(screen.getByTestId("inspector")).toHaveTextContent("two");
  expect(list.getByRole("button",{name:"查看 Second skill 的详情"}).closest("tr")).toHaveAttribute("aria-selected","true");
  expect(list.getByRole("button",{name:"查看 Earlier skill 的详情"})).toBeInTheDocument();
  expect(scroll).not.toHaveBeenCalled();
 } finally {
  if (original) Object.defineProperty(HTMLElement.prototype,"scrollIntoView",original);
  else Reflect.deleteProperty(HTMLElement.prototype,"scrollIntoView");
 }
});

it("collapses a skill's parent and moves selection, focus and preview to that folder on Left", () => {
 render(<SkillBrowserWorkspace {...props} folders={[{key:"before",name:"Other",path:"",skillCount:0,onOpen:vi.fn()},...folders]}/>);
 const list=within(screen.getByRole("region",{name:"技能列表"}));
 fireEvent.click(list.getByRole("button",{name:"展开 Example/Tools"}));
 const skill=list.getByRole("button",{name:"查看 Second skill 的详情"});
 fireEvent.click(skill);
 fireEvent.keyDown(skill,{key:"ArrowLeft"});
 const parent=list.getByRole("button",{name:"Example/Tools"}).closest("tr")!;
 expect(parent).toHaveFocus();
 expect(parent).toHaveAttribute("aria-selected","true");
 expect(list.getByRole("button",{name:"展开 Example/Tools"})).toHaveAttribute("aria-expanded","false");
 expect(list.queryByRole("button",{name:"查看 Second skill 的详情"})).not.toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"Example/Tools"})).toBeInTheDocument();
 expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
});
