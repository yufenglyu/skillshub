import { describe,it,expect } from "vitest";
import { browserStats } from "@/lib/browserStats";
import type { SkillTableItem } from "@/components/skill/SkillBrowserTable";
describe("browser status",()=>{
  it("counts collapsed folder members and deduplicates parent/child selections",()=>{
    const skill:SkillTableItem={name:"Example",rowKey:"row",detailRequest:{skillId:"same"},isCentral:true};
    const rows=[{key:"folder:a",folder:{key:"a",name:"Repo",path:"",skillCount:1,children:[skill],onOpen:()=>{}}},{key:"skill:a",skill}];
    expect(browserStats(rows,new Set(["folder:a","skill:a"]))).toMatchObject({skills:1,selected:1,groups:1,installed:1});
  });
  it("clears stats for filtered empty results",()=>{
    expect(browserStats([],new Set(["stale"]))).toMatchObject({skills:0,selected:0,installed:0});
  });
});
