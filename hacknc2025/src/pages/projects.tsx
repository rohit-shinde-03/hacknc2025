import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { getUserProjects, deleteProject, updateProject, duplicateProject } from "../../utils/projects";
import type { Project } from "@/types/project";

export default function Projects() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUserProjects();
      setProjects(data);
    } catch (error) {
      console.error("Error loading projects:", error);
      alert("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Handle loading a project
  const handleLoadProject = useCallback(
    (projectId: string) => {
      router.push(`/?projectId=${projectId}`);
    },
    [router]
  );

  // Handle deleting a project
  const handleDeleteProject = useCallback(
    async (projectId: string, projectName: string) => {
      if (!confirm(`Are you sure you want to delete "${projectName}"?`)) {
        return;
      }

      try {
        await deleteProject(projectId);
        await loadProjects();
        alert("Project deleted successfully");
      } catch (error) {
        console.error("Error deleting project:", error);
        alert("Failed to delete project");
      }
    },
    [loadProjects]
  );

  // Handle duplicating a project
  const handleDuplicateProject = useCallback(
    async (projectId: string) => {
      try {
        const newProject = await duplicateProject(projectId);
        await loadProjects();
        alert(`Project duplicated as "${newProject.name}"`);
      } catch (error) {
        console.error("Error duplicating project:", error);
        alert("Failed to duplicate project");
      }
    },
    [loadProjects]
  );

  // Start editing a project name
  const handleStartEdit = useCallback((project: Project) => {
    setEditingId(project.id);
    setEditingName(project.name);
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  // Save edited name
  const handleSaveEdit = useCallback(
    async (projectId: string) => {
      if (!editingName.trim()) {
        alert("Project name cannot be empty");
        return;
      }

      try {
        await updateProject(projectId, { name: editingName.trim() });
        await loadProjects();
        setEditingId(null);
        setEditingName("");
      } catch (error) {
        console.error("Error renaming project:", error);
        alert("Failed to rename project");
      }
    },
    [editingName, loadProjects]
  );

  // Create new project
  const handleNewProject = useCallback(() => {
    router.push("/");
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center p-8">
          <div className="text-xl text-slate-600">Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">My Projects</h1>
          <button
            onClick={handleNewProject}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
          >
            + New Project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-slate-600 mb-4">No projects yet</p>
            <p className="text-slate-500 mb-6">Create your first beat to get started!</p>
            <button
              onClick={handleNewProject}
              className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
            >
              Create New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-slate-200 overflow-hidden"
              >
                <div className="p-6">
                  {/* Project Name */}
                  {editingId === project.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveEdit(project.id);
                        } else if (e.key === "Escape") {
                          handleCancelEdit();
                        }
                      }}
                      className="w-full px-3 py-2 text-lg font-bold border-2 border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                      autoFocus
                    />
                  ) : (
                    <h2
                      className="text-xl font-bold text-slate-800 mb-2 cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => handleLoadProject(project.id)}
                    >
                      {project.name}
                    </h2>
                  )}

                  {/* Project Info */}
                  <div className="text-sm text-slate-600 mb-4 space-y-1">
                    <div>BPM: {project.bpm}</div>
                    <div>
                      Created: {new Date(project.created_at).toLocaleDateString()}
                    </div>
                    <div>
                      Modified: {new Date(project.updated_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {editingId === project.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(project.id)}
                        className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex-1 px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-700 font-medium rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleLoadProject(project.id)}
                        className="col-span-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleStartEdit(project)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded transition-colors text-sm"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDuplicateProject(project.id)}
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded transition-colors text-sm"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id, project.name)}
                        className="col-span-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
