import {it,expect} from "vitest";
import {repositoryUpdateRows,updateItemKey} from "@/lib/repositoryUpdateRows";
const added={skillId:"new",name:"New",sourcePath:"skills/new/SKILL.md",version:"v1"};
const deleted={skillId:"old",name:"Old",version:"deleted"};
const repo={repository:"owner/repo",added:[added],deleted:[deleted],modified:[],unchanged:[]};
it("merges a one-to-one replacement into deleted and keys it by the new version",()=>{
 const rows=repositoryUpdateRows([repo],{});
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({category:"deleted",item:deleted,replacement:added});
 expect(rows[0].key).not.toBe(repositoryUpdateRows([{...repo,added:[{...added,version:"v2"}]}],{})[0].key);
});
it("requires explicit pairing for multiple candidates without pairing across repositories",()=>{
 const other={...added,skillId:"other",sourcePath:"skills/other/SKILL.md"};
 const rows=repositoryUpdateRows([{...repo,added:[added,other]},{...repo,repository:"other/repo",deleted:[]}],{});
 expect(rows[0].replacement).toBeUndefined(); expect(rows[1].category).toBe("added");
 const paired=repositoryUpdateRows([{...repo,added:[added,other]}],{[updateItemKey(repo.repository,deleted)]:updateItemKey(repo.repository,other)});
 expect(paired[0].replacement).toEqual(other);
});
