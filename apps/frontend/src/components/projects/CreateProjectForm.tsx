import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, type CreateProjectInput } from "../../api/projects";
import { X } from "lucide-react";
import Button from "../ui/Button";

interface CreateProjectFormProps {
  onClose: () => void;
}

export default function CreateProjectForm({ onClose }: CreateProjectFormProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateProjectInput>({
    name: "",
    repositoryUrl: "",
    githubToken: "",
    defaultBranch: "main",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (data: CreateProjectInput) => {
      const payload = { ...data };
      if (!payload.githubToken) delete payload.githubToken;
      return projectsApi.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (error: { message?: string; details?: Array<{ field: string; message: string }> }) => {
      if (error.details) {
        const fieldErrors: Record<string, string> = {};
        for (const detail of error.details) fieldErrors[detail.field] = detail.message;
        setErrors(fieldErrors);
      } else {
        setErrors({ general: error.message ?? "Failed to create project" });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    mutation.mutate(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-section-title">New Project</h2>
          <button onClick={onClose} style={{ padding: "6px", color: "var(--color-text-faint)", background: "none", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {errors.general && (
            <div style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", background: "var(--color-error-dim)", border: "1px solid rgba(239, 68, 68, 0.15)", color: "#f87171", fontSize: "13px" }}>
              {errors.general}
            </div>
          )}

          <div>
            <label className="text-label" style={{ display: "block", marginBottom: "6px" }}>Project Name</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="my-project" className="input" />
            {errors.name && <p style={{ fontSize: "12px", color: "#f87171", marginTop: "4px" }}>{errors.name}</p>}
            <p className="text-caption" style={{ marginTop: "4px" }}>Lowercase letters, numbers, and hyphens. Used as subdomain.</p>
          </div>

          <div>
            <label className="text-label" style={{ display: "block", marginBottom: "6px" }}>GitHub Repository URL</label>
            <input type="url" value={formData.repositoryUrl} onChange={(e) => setFormData({ ...formData, repositoryUrl: e.target.value })} placeholder="https://github.com/user/repo" className="input" />
            {errors.repositoryUrl && <p style={{ fontSize: "12px", color: "#f87171", marginTop: "4px" }}>{errors.repositoryUrl}</p>}
          </div>

          <div>
            <label className="text-label" style={{ display: "block", marginBottom: "6px" }}>Default Branch</label>
            <input type="text" value={formData.defaultBranch} onChange={(e) => setFormData({ ...formData, defaultBranch: e.target.value })} placeholder="main" className="input" />
          </div>

          <div>
            <label className="text-label" style={{ display: "block", marginBottom: "6px" }}>
              GitHub Token <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <input type="password" value={formData.githubToken} onChange={(e) => setFormData({ ...formData, githubToken: e.target.value })} placeholder="ghp_xxxxxxxxxxxx" className="input" style={{ fontFamily: "var(--font-mono)" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "4px" }}>
            <Button variant="ghost" size="sm" onClick={onClose} type="button">Cancel</Button>
            <Button size="sm" type="submit" loading={mutation.isPending}>Create Project</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
