import {beforeEach,it,expect} from "vitest";
import {render,screen,fireEvent} from "@testing-library/react";
import {TaskCenter} from "@/components/layout/TaskCenter";
import {useTaskQueueStore as queue, type BackgroundTask} from "@/stores/taskQueueStore";
const task=(id:string,status:BackgroundTask["status"]):BackgroundTask=>({id,key:id,label:id,kind:"check",status,cancelRequested:false,createdAt:1,locks:[],steps:[{label:id,command:"test",args:{},status}]});
beforeEach(()=>{queue.setState({tasks:[task("running","running"),task("queued","queued"),task("done","success")]});});
it("distinguishes immediate queue cancellation from stopping a running step",()=>{
  render(<TaskCenter/>);
  fireEvent.click(screen.getByRole("button",{name:"后台任务 (2)"}));
  fireEvent.click(screen.getByRole("button",{name:"停止全部"}));
  expect(queue.getState().tasks.find(t=>t.id==="queued")?.status).toBe("cancelled");
  expect(queue.getState().tasks.find(t=>t.id==="running")).toMatchObject({status:"running",cancelRequested:true});
  expect(screen.getByText("当前步骤结束后停止；已完成的操作保留。")).toBeInTheDocument();
});
it("keeps active tasks when clearing finished records and keeps dialog height when filtering",()=>{
  render(<TaskCenter/>);
  fireEvent.click(screen.getByRole("button",{name:"后台任务 (2)"}));
  const dialog=screen.getByRole("dialog");
  const height=dialog.style.height;
  fireEvent.click(screen.getByRole("button",{name:"进行中 2"}));
  expect(dialog.style.height).toBe(height);
  fireEvent.click(screen.getByRole("button",{name:"清理已结束记录"}));
  expect(queue.getState().tasks.map(t=>t.id)).toEqual(["running","queued"]);
});
