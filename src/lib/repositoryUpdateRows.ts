import type {RepositorySyncPreview, RepositorySyncPreviewItem} from "@/types";
export type UpdateCategory = "added" | "modified" | "deleted" | "unchanged";
export const updateCategories: UpdateCategory[] = ["added","modified","deleted","unchanged"];
export const updateItemKey = (repo:string,item:RepositorySyncPreviewItem) => `${repo.toLowerCase()}:${item.skillId}:${item.version ?? ""}`;
export function repositoryUpdateRows(repositories:RepositorySyncPreview[], pairs:Record<string,string>) {
  return repositories.flatMap(repo => {
    if (repo.error) return [];
    const candidates=repo.deleted.length ? repo.added.filter(item=>item.sourcePath && item.version) : [];
    return updateCategories.flatMap(category => repo[category]
      .filter(item=>category!=="added" || !candidates.includes(item))
      .map(item=>{
        const pairKey=updateItemKey(repo.repository,item);
        const replacement=category==="deleted" ? candidates.find(candidate=>updateItemKey(repo.repository,candidate)===pairs[pairKey]) ?? (repo.deleted.length===1 && candidates.length===1 ? candidates[0] : undefined) : undefined;
        return {repo:repo.repository,error:repo.error,item,category,pairKey,replacement,
          candidates:category==="deleted" ? candidates : [],
          key:replacement ? `${pairKey}:replace:${updateItemKey(repo.repository,replacement)}` : pairKey};
      }));
  });
}
