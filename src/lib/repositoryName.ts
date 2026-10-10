export function formatRepositoryName(repository: string, repositoryFirst: boolean): string {
  const parts = repository.split("/");
  return repositoryFirst && parts.length === 2 && parts.every(Boolean)
    ? `${parts[1]}@${parts[0]}`
    : repository;
}
