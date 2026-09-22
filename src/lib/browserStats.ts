import type { FolderTableItem, SkillTableItem } from "@/components/skill/SkillBrowserTable";
import type { InstallSummaryMember } from "@/lib/installSummary";
type Row = {key:string; skill?:SkillTableItem; folder?:FolderTableItem};
function members(row: Row): InstallSummaryMember[] {
  if (row.skill) return row.skill.installSummaryMembers ?? [{id:row.skill.detailRequest?.skillId ?? row.skill.rowKey ?? row.skill.name, is_central:row.skill.isCentral ?? false,linked_agents:row.skill.installLinkedAgentIds,read_only_agents:row.skill.installReadOnlyAgentIds}];
  return row.folder?.children?.length ? row.folder.children.flatMap(skill => members({key:"",skill})) : row.folder?.installSummaryMembers ?? [];
}
function unique(rows: Row[]) {
  const result = new Map<string,InstallSummaryMember>();
  rows.forEach(row => members(row).forEach((member,index) => {
    const key = member.id ?? `${row.key}:${index}`;
    const previous=result.get(key);
    result.set(key, previous ? {...member,is_central:previous.is_central || member.is_central,linked_agents:[...(previous.linked_agents??[]),...(member.linked_agents??[])],read_only_agents:[...(previous.read_only_agents??[]),...(member.read_only_agents??[])]} : member);
  }));
  return [...result.values()];
}
export function browserStats(rows: Row[], selected: Set<string>) {
  const all=unique(rows);
  const selection=rows.filter(row => selected.has(row.key));
  return {groups:rows.filter(row=>row.folder).length,skills:all.length,selected:unique(selection).length,selectedGroups:selection.filter(row=>row.folder).length,installed:all.filter(m=>m.is_central || m.linked_agents?.length || m.read_only_agents?.length).length,name:selection.length===1 ? selection[0].skill?.name ?? selection[0].folder?.name : undefined};
}
