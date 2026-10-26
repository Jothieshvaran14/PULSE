export interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  defaultBranch: string;
  frameworkId: string | null;
  status: "ACTIVE" | "INACTIVE" | "DELETED";
  createdAt: string;
  updatedAt: string;
  framework?: {
    name: string;
    displayName: string;
  } | null;
}

export interface CreateProjectInput {
  name: string;
  repositoryUrl: string;
  githubToken?: string;
  defaultBranch?: string;
}

export interface UpdateProjectInput {
  name?: string;
  repositoryUrl?: string;
  githubToken?: string;
  defaultBranch?: string;
}
